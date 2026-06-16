import { describe, expect, it } from "vitest";
import { redactLogSecrets } from "../../src/config/logger.js";

describe("logger redaction", () => {
  it("redacts Telegram bot tokens embedded in API URLs", () => {
    const message =
      "request to https://api.telegram.org/bot123456789:AAExample_secret-Token/setWebhook failed";

    const redacted = redactLogSecrets(message);

    expect(redacted).toBe("request to https://api.telegram.org/bot[redacted]/setWebhook failed");
    expect(redacted).not.toContain("AAExample_secret-Token");
  });
});
