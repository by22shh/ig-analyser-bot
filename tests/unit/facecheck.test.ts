import { afterEach, describe, expect, it, vi } from "vitest";
import { RealFaceCheckAdapter } from "../../src/modules/photo-search/adapters/facecheck.adapter.js";

describe("RealFaceCheckAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty match list when FaceCheck completes with no items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id_search: "search_1" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output: { items: [] } }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new RealFaceCheckAdapter("token");
    await expect(
      adapter.search({ bytes: Buffer.from("image"), mimeType: "image/jpeg" })
    ).resolves.toEqual([]);
  });
});
