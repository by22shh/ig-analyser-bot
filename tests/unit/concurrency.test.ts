import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../src/util/concurrency.js";

describe("mapWithConcurrency", () => {
  it("returns an empty array for empty input", async () => {
    expect(await mapWithConcurrency([], 3, async (n: number) => n)).toEqual([]);
  });

  it("preserves input order regardless of completion order", async () => {
    const fn = async (n: number) => {
      // Earlier items finish later, so a naive push-on-resolve would reorder.
      await new Promise((resolve) => setTimeout(resolve, (5 - n) * 5));
      return n * 10;
    };
    expect(await mapWithConcurrency([1, 2, 3, 4], 4, fn)).toEqual([10, 20, 30, 40]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let active = 0;
    let maxActive = 0;
    const fn = async (n: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return n;
    };
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, fn);
    expect(maxActive).toBe(2);
  });

  it("runs sequentially when the limit is 1", async () => {
    let active = 0;
    let maxActive = 0;
    const fn = async (n: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return n;
    };
    await mapWithConcurrency([1, 2, 3], 1, fn);
    expect(maxActive).toBe(1);
  });

  it("treats a non-positive limit as 1 instead of stalling", async () => {
    expect(await mapWithConcurrency([1, 2, 3], 0, async (n: number) => n)).toEqual([1, 2, 3]);
  });

  it("passes the index to the mapper", async () => {
    const result = await mapWithConcurrency(
      ["a", "b", "c"],
      2,
      async (value, index) => `${index}:${value}`
    );
    expect(result).toEqual(["0:a", "1:b", "2:c"]);
  });
});
