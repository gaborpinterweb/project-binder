import { expect, test } from "@playwright/test";
import { isSafePathId, newId } from "../src/ids.js";

test.describe("entity ids", () => {
  test("upload paths accept short ids and legacy UUIDs", () => {
    expect(isSafePathId(newId())).toBe(true);
    expect(isSafePathId("0000000000c0")).toBe(true);
    expect(isSafePathId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isSafePathId("not-a-valid-id")).toBe(false);
    expect(isSafePathId("short")).toBe(false);
  });
});
