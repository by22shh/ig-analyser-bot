import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
  deleteObjects(keys: string[]): Promise<void>;
  deletePrefix?(prefix: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root = join(process.cwd(), ".data", "artifacts")) {}

  async putObject(input: {
    key: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObject> {
    const path = join(this.root, input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.bytes);
    return { key: input.key, publicUrl: `file://${path}`, sizeBytes: input.bytes.length };
  }

  async signedUrl(key: string): Promise<string> {
    return `file://${join(this.root, key)}`;
  }

  async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map((key) => rm(join(this.root, key), { force: true }).catch(() => undefined))
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(join(this.root, prefix), { recursive: true, force: true });
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

  async putObject(input: {
    key: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType
      })
    );
    const publicUrl = env.S3_PUBLIC_BASE_URL
      ? `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${input.key}`
      : undefined;
    return { key: input.key, publicUrl, sizeBytes: input.bytes.length };
  }

  async signedUrl(key: string, expiresSeconds = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
      expiresIn: expiresSeconds
    });
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (!keys.length) return;
    // DeleteObjects accepts up to 1000 keys per request.
    for (let index = 0; index < keys.length; index += 1000) {
      const batch = keys.slice(index, index + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true }
        })
      );
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );
      const keys = listed.Contents?.map((object) => object.Key).filter(
        (key): key is string => typeof key === "string" && key.length > 0
      );
      if (keys?.length) await this.deleteObjects(keys);
      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);
  }
}

export function createStorageAdapter(): StorageAdapter {
  return providerMode.storage === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
}
