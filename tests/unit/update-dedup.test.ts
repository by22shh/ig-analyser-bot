import { describe, expect, it } from "vitest";
import { isDuplicateUpdateError } from "../../src/telegram/middleware/update-dedup.js";

describe("isDuplicateUpdateError", () => {
  it("treats a Prisma unique-constraint violation as an already-seen update", () => {
    expect(isDuplicateUpdateError({ code: "P2002" })).toBe(true);
  });

  it("does not classify other failures as duplicates (so they are not silently dropped)", () => {
    expect(isDuplicateUpdateError({ code: "P1001" })).toBe(false);
    expect(isDuplicateUpdateError(new Error("connection reset"))).toBe(false);
    expect(isDuplicateUpdateError(null)).toBe(false);
    expect(isDuplicateUpdateError(undefined)).toBe(false);
  });
});
