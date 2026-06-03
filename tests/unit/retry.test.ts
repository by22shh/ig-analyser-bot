import { describe, expect, it } from "vitest";
import { isFinalAttempt } from "../../src/jobs/retry.js";

describe("isFinalAttempt", () => {
  it("is not final on the first of two attempts so a reserve survives the retry", () => {
    expect(isFinalAttempt({ attemptsMade: 0, attempts: 2 })).toBe(false);
  });

  it("is final on the last allowed attempt", () => {
    expect(isFinalAttempt({ attemptsMade: 1, attempts: 2 })).toBe(true);
  });

  it("is final immediately when only one attempt is configured", () => {
    expect(isFinalAttempt({ attemptsMade: 0, attempts: 1 })).toBe(true);
  });

  it("treats a missing attempts budget as a single final attempt", () => {
    expect(isFinalAttempt({ attemptsMade: 0, attempts: undefined })).toBe(true);
  });

  it("stays non-final partway through a longer retry budget", () => {
    expect(isFinalAttempt({ attemptsMade: 1, attempts: 3 })).toBe(false);
  });
});
