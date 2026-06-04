import { env } from "../../../config/env.js";
import { normalizeInstagramUsername } from "../../instagram/normalize.js";

export type PhotoSearchMatchView = {
  username: string;
  profileUrl: string;
  confidence: number;
  source: string;
  sourceUrl: string;
  rawScore?: number;
};

export interface FaceCheckAdapter {
  search(input: { bytes: Buffer; mimeType: string }): Promise<PhotoSearchMatchView[]>;
}

export class MockFaceCheckAdapter implements FaceCheckAdapter {
  async search(): Promise<PhotoSearchMatchView[]> {
    return [
      {
        username: "mock_public_profile",
        profileUrl: "https://www.instagram.com/mock_public_profile/",
        confidence: 0.78,
        source: "mock-facecheck",
        sourceUrl: "https://www.instagram.com/mock_public_profile/",
        rawScore: 78
      }
    ];
  }
}

export class RealFaceCheckAdapter implements FaceCheckAdapter {
  constructor(private readonly token = env.FACECHECK_API_TOKEN) {}

  async search(input: { bytes: Buffer; mimeType: string }): Promise<PhotoSearchMatchView[]> {
    if (!this.token) throw new Error("FACECHECK_API_TOKEN_MISSING");
    const form = new FormData();
    form.append(
      "images",
      new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }),
      "photo.jpg"
    );
    const upload = await fetch("https://facecheck.id/api/upload_pic", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form
    });
    if (!upload.ok) throw new Error(`FACECHECK_UPLOAD_${upload.status}`);
    const uploaded = (await upload.json()) as { id_search?: string };
    if (!uploaded.id_search) throw new Error("FACECHECK_UPLOAD_NO_ID");
    const deadline = Date.now() + (env.FACECHECK_TIMEOUT_SECONDS ?? 90) * 1000;
    while (Date.now() < deadline) {
      const response = await fetch("https://facecheck.id/api/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id_search: uploaded.id_search })
      });
      if (!response.ok) throw new Error(`FACECHECK_SEARCH_${response.status}`);
      const result = (await response.json()) as {
        output?: { items?: Array<{ score?: number; url?: string }> };
      };
      const items = result.output?.items;
      if (Array.isArray(items)) {
        return items
          .map((item): PhotoSearchMatchView | null => {
            const username = extractInstagramUsername(item.url ?? "");
            if (!username) return null;
            const match: PhotoSearchMatchView = {
              username,
              profileUrl: `https://www.instagram.com/${username}/`,
              confidence: Math.min(Math.max((item.score ?? 0) / 100, 0), 1),
              source: "facecheck",
              sourceUrl: item.url ?? ""
            };
            if (item.score != null) match.rawScore = item.score;
            return match;
          })
          .filter((item): item is PhotoSearchMatchView => item !== null)
          .slice(0, 8);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("FACECHECK_TIMEOUT");
  }
}

function extractInstagramUsername(url: string): string | null {
  try {
    if (!url.includes("instagram.com")) return null;
    return normalizeInstagramUsername(url);
  } catch {
    return null;
  }
}
