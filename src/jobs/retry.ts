/**
 * Decides whether the currently-running BullMQ attempt is the last one.
 *
 * During processing BullMQ exposes `attemptsMade` as the number of attempts
 * completed *before* the current run (0 on the first run). It retries while
 * `attemptsMade + 1 < attempts`, so the current run is final once
 * `attemptsMade + 1 >= attempts`. Reserved credits must only be released on the
 * final attempt, otherwise a successful retry would capture an already-released
 * reserve (i.e. hand out the work for free).
 */
export function isFinalAttempt(job: { attemptsMade: number; attempts: number | undefined }): boolean {
  const attempts = job.attempts && job.attempts > 0 ? job.attempts : 1;
  return job.attemptsMade + 1 >= attempts;
}
