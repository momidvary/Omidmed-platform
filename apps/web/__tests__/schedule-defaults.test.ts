import { describe, expect, it } from "vitest";
import {
  ALTERNATE_DAYS,
  EVERY_DAY,
  WEEK_ORDER_FA,
  defaultPrecautions,
  defaultStopRules,
  defaultWeekdays,
} from "@/lib/clinical/scheduleDefaults";

describe("home-program starting values", () => {
  it("rests loaded strength and jumping work every other day", () => {
    expect(defaultWeekdays("strength")).toEqual(ALTERNATE_DAYS);
    expect(defaultWeekdays("plyometric")).toEqual(ALTERNATE_DAYS);
    expect(defaultWeekdays("mobility")).toEqual(EVERY_DAY);
    expect(defaultWeekdays(undefined)).toEqual(EVERY_DAY);
    // Returned arrays are copies, so editing a row never changes the default.
    defaultWeekdays("strength").push(2);
    expect(ALTERNATE_DAYS).toEqual([1, 3, 6]);
  });

  it("starts the Persian week on Saturday", () => {
    expect(WEEK_ORDER_FA[0]).toBe(6);
    expect([...WEEK_ORDER_FA].sort()).toEqual(EVERY_DAY);
  });

  it("gives patient-facing safety text that names the emergency route", () => {
    expect(defaultStopRules("fa")).toMatch(/۱۱۵/);
    expect(defaultStopRules("fa")).toMatch(/۷ از ۱۰/);
    expect(defaultPrecautions("fa").length).toBeGreaterThan(20);
    expect(defaultStopRules("en")).toMatch(/emergency/);
  });
});
