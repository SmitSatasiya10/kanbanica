import { describe, expect, it } from "vitest";
import {
  isValidTaskLimit,
  MAX_TASK_LIMIT,
  MIN_TASK_LIMIT,
  TASK_LIMIT_CODE,
  taskLimitReachedMessage,
} from "@/lib/task-limit";

describe("isValidTaskLimit", () => {
  it("accepts integers in range, inclusive", () => {
    expect(isValidTaskLimit(MIN_TASK_LIMIT)).toBe(true);
    expect(isValidTaskLimit(10_000)).toBe(true);
    expect(isValidTaskLimit(MAX_TASK_LIMIT)).toBe(true);
  });

  it.each([
    0,
    -1,
    -100,
    1.5,
    MAX_TASK_LIMIT + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "100",
    null,
    undefined,
  ])("rejects %p", (value) => {
    expect(isValidTaskLimit(value)).toBe(false);
  });
});

describe("taskLimitReachedMessage", () => {
  it("names the formatted limit and says archived tasks count", () => {
    const msg = taskLimitReachedMessage(10_000);
    expect(msg).toContain("10,000");
    expect(msg).toContain("Archived tasks still count");
  });

  it("exposes a stable machine-readable code", () => {
    expect(TASK_LIMIT_CODE).toBe("TASK_LIMIT_REACHED");
  });
});
