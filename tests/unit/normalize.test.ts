import { describe, expect, it } from "vitest";
import { normalizeInstagramUsername } from "../../src/modules/instagram/normalize.js";

describe("normalizeInstagramUsername", () => {
  it("accepts usernames, handles @ and profile URLs", () => {
    expect(normalizeInstagramUsername("@Some.User_1")).toBe("Some.User_1");
    expect(normalizeInstagramUsername("https://www.instagram.com/some.user_1/?hl=ru")).toBe(
      "some.user_1"
    );
    expect(normalizeInstagramUsername("instagram.com/name")).toBe("name");
  });

  it("rejects reserved paths and invalid values", () => {
    expect(() => normalizeInstagramUsername("https://instagram.com/p/abc")).toThrow(
      "USERNAME_RESERVED_PATH"
    );
    expect(() => normalizeInstagramUsername("https://instagram.com.evil.test/someone")).toThrow(
      "USERNAME_INVALID_URL"
    );
    expect(() => normalizeInstagramUsername("bad name")).toThrow("USERNAME_HAS_SPACES");
    expect(() => normalizeInstagramUsername("too-long-too-long-too-long-too-long")).toThrow(
      "USERNAME_INVALID_CHARS"
    );
  });
});
