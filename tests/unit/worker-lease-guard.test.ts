import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { processAnalysisJob } from "../../src/jobs/workers/analysis.worker.js";
import { processPhotoSearchJob } from "../../src/jobs/workers/photo-search.worker.js";

const originalFacecheckToken = env.FACECHECK_API_TOKEN;

describe("worker lease guards", () => {
  afterEach(() => {
    env.FACECHECK_API_TOKEN = originalFacecheckToken;
  });

  it("does not mark an analysis job failed when another worker completed it", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      analysisJob: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "analysis-1",
          userId: "user-1",
          status: "fetching_profile",
          mode: "standard",
          targetUsername: "alice",
          telegramChatId: 100n,
          costCreditUnits: 100,
          user: { language: "ru", settings: null }
        }),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ status: "fetching_profile", queueLockedBy: "worker-1" })
          .mockResolvedValueOnce({ status: "completed", queueLockedBy: null }),
        updateMany
      }
    } as never;
    const reportService = {
      cleanupByAnalysisJob: vi.fn().mockRejectedValue(new Error("REPORT_CLEANUP_FAILED"))
    };

    await expect(
      processAnalysisJob(
        {
          prisma,
          instagram: {} as never,
          llm: {} as never,
          reportService: reportService as never
        },
        "analysis-1",
        { attemptsMade: 0, attempts: 2, lease: { workerId: "worker-1" } }
      )
    ).resolves.toBeUndefined();

    expect(updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: expect.stringMatching(/failed|retrying/) })
      })
    );
  });

  it("does not mark a photo search job failed when another worker completed it", async () => {
    env.FACECHECK_API_TOKEN = "";
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      photoSearchJob: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "photo-1",
          userId: "user-1",
          status: "searching",
          telegramFileId: "file-1",
          inputMimeType: "image/jpeg",
          telegramChatId: 100n,
          user: { telegramId: 100n, language: "ru" }
        }),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ status: "searching", queueLockedBy: "worker-1" })
          .mockResolvedValueOnce({ status: "completed", queueLockedBy: null }),
        updateMany
      },
      photoSearchMatch: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) }
    } as never;

    await expect(
      processPhotoSearchJob(
        {
          prisma,
          facecheck: { search: vi.fn().mockRejectedValue(new Error("FACECHECK_TIMEOUT")) } as never
        },
        "photo-1",
        { attemptsMade: 0, attempts: 2, lease: { workerId: "worker-1" } }
      )
    ).resolves.toBeUndefined();

    expect(updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: expect.stringMatching(/failed|retrying/) })
      })
    );
  });
});
