import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import {
  helpKeyboard,
  mainMenuKeyboard,
  profileKeyboard
} from "../../src/telegram/keyboards/main-menu.js";
import {
  reportActionsKeyboard,
  reportChatAnswerKeyboard,
  reportChatKeyboard,
  sectionListKeyboard,
  sectionViewKeyboard
} from "../../src/telegram/keyboards/reports.js";
import { ru } from "../../src/telegram/locales/ru.js";

const REPORT_ID = "00000000-0000-0000-0000-000000000000";
const SECTION_ID = "11111111-1111-1111-1111-111111111111";

describe("telegram UX keyboards", () => {
  it("does not render empty rows when optional links are disabled", () => {
    const restore = {
      channelUrl: env.CHANNEL_URL,
      supportUrl: env.SUPPORT_URL,
      tosUrl: env.TOS_URL,
      miniApp: env.FEATURE_MINI_APP,
      photoSearch: env.FEATURE_PHOTO_SEARCH
    };
    try {
      env.CHANNEL_URL = "";
      env.SUPPORT_URL = "";
      env.TOS_URL = "";
      env.FEATURE_MINI_APP = false;
      env.FEATURE_PHOTO_SEARCH = false;

      expect(expectEmptyRows(mainMenuKeyboard(ru).inline_keyboard)).toEqual([]);
      expect(expectEmptyRows(helpKeyboard(ru).inline_keyboard)).toEqual([]);
    } finally {
      env.CHANNEL_URL = restore.channelUrl;
      env.SUPPORT_URL = restore.supportUrl;
      env.TOS_URL = restore.tosUrl;
      env.FEATURE_MINI_APP = restore.miniApp;
      env.FEATURE_PHOTO_SEARCH = restore.photoSearch;
    }
  });

  it("keeps callback_data within Telegram's 64-byte limit", () => {
    const keyboards = [
      mainMenuKeyboard(ru, true).inline_keyboard,
      helpKeyboard(ru).inline_keyboard,
      profileKeyboard(ru).inline_keyboard,
      reportActionsKeyboard(ru, REPORT_ID).inline_keyboard,
      reportChatKeyboard(ru, REPORT_ID).inline_keyboard,
      reportChatAnswerKeyboard(ru, REPORT_ID).inline_keyboard,
      sectionListKeyboard(ru, REPORT_ID, [{ id: SECTION_ID, position: 1, title: "Большая секция" }])
        .inline_keyboard,
      sectionViewKeyboard(ru, REPORT_ID, {
        prevId: SECTION_ID,
        nextId: "22222222-2222-2222-2222-222222222222"
      }).inline_keyboard
    ];

    const tooLong = keyboards.flatMap(callbacksOverLimit);

    expect(tooLong).toEqual([]);
  });
});

function expectEmptyRows(rows: Array<Array<unknown>>): string[] {
  return rows.flatMap((row, index) => (row.length === 0 ? [`row:${index}`] : []));
}

function callbacksOverLimit(rows: Array<Array<unknown>>): string[] {
  return rows.flatMap((row) =>
    row.flatMap((button) => {
      const callbackData =
        button && typeof button === "object" && "callback_data" in button
          ? String((button as { callback_data?: unknown }).callback_data ?? "")
          : "";
      const byteLength = Buffer.byteLength(callbackData, "utf8");
      return callbackData && byteLength > 64 ? [`${byteLength}:${callbackData}`] : [];
    })
  );
}
