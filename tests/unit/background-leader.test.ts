import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startBackgroundLoopLeader,
  type RuntimeLeaseStore
} from "../../src/jobs/background-leader.js";

describe("background loop leader", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts loops after acquiring the lease and releases it on stop", async () => {
    vi.useFakeTimers();
    const stopLoop = vi.fn();
    const start = vi.fn(() => [{ stop: stopLoop }]);
    const store = leaseStore([true]);

    const handle = startBackgroundLoopLeader({
      store,
      leaseName: "test-lease",
      holderId: "holder-1",
      start,
      renewMs: 100,
      retryMs: 100
    });

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await handle.stop();

    expect(stopLoop).toHaveBeenCalledTimes(1);
    expect(store.release).toHaveBeenCalledWith({
      leaseName: "test-lease",
      holderId: "holder-1"
    });
  });

  it("waits and retries when another worker owns the lease", async () => {
    vi.useFakeTimers();
    const start = vi.fn(() => [{ stop: vi.fn() }]);
    const store = leaseStore([false, true]);

    const handle = startBackgroundLoopLeader({
      store,
      leaseName: "test-lease",
      holderId: "holder-1",
      start,
      renewMs: 100,
      retryMs: 100
    });

    await vi.waitFor(() => expect(store.acquire).toHaveBeenCalledTimes(1));
    expect(start).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await handle.stop();
  });

  it("stops active loops when a renewed lease is lost", async () => {
    vi.useFakeTimers();
    const stopLoop = vi.fn();
    const start = vi.fn(() => [{ stop: stopLoop }]);
    const store = leaseStore([true, false]);

    const handle = startBackgroundLoopLeader({
      store,
      leaseName: "test-lease",
      holderId: "holder-1",
      start,
      renewMs: 100,
      retryMs: 100
    });

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(stopLoop).toHaveBeenCalledTimes(1));
    await handle.stop();
  });
});

function leaseStore(results: boolean[]): RuntimeLeaseStore {
  return {
    acquire: vi.fn(async () => results.shift() ?? results.at(-1) ?? false),
    release: vi.fn(async () => undefined)
  };
}
