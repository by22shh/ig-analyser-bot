import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env, providerMode } from "../../config/env.js";

export type StoredObject = {
  key: string;
  publicUrl?: string;
  sizeBytes: number;
};

export interface StorageAdapter {
  putObject(input: { key: string; bytes: Buffer; contentType: string }): Promise<StoredObject>;
  signedUrl(key: string, expiresSeconds?: number): Promise<string | undefined>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root = join(process.cwd(), ".data", "artifacts")) {}

  async putObject(input: { key: string; bytes: Buffer; contentType: string }): Promise<StoredObject> {
    const path = join(this.root, input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.bytes);
    return { key: input.key, publicUrl: `file://${path}`, sizeBytes: input.bytes.length };
  }

  async signedUrl(key: string): Promise<string> {
    return `file://${join(this.root, key)}`;
  }
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT || undefined,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY
      }
    });
  }

  async putObject(input: { key: string; bytes: Buffer; contentType: string }): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType
      })
    );
    const publicUrl = env.S3_PUBLIC_BASE_URL ? `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${input.key}` : undefined;
    return { key: input.key, publicUrl, sizeBytes: input.bytes.length };
  }

  async signedUrl(key: string, expiresSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      { expiresIn: expiresSeconds }
    );
  }
}

export function createStorageAdapter(): StorageAdapter {
  return providerMode.storage === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
}
