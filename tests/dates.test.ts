import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidIsoDate, resolveRange } from "../lib/dates";

describe("date ranges", () => {
  const now = new Date("2026-11-09T15:00:00Z");

  it("resolves the last 7 days inclusively", () => {
    const range = resolveRange({ preset: "last_7d", timezone: "UTC", now });
    expect(range.start).toBe("2026-11-03");
    expect(range.end).toBe("2026-11-09");
    expect(range.days).toBe(7);
    expect(range.previousEnd).toBe("2026-11-02");
    expect(range.previousStart).toBe("2026-10-27");
  });

  it("resolves yesterday and today", () => {
    expect(resolveRange({ preset: "today", timezone: "UTC", now })).toMatchObject({ start: "2026-11-09", end: "2026-11-09" });
    expect(resolveRange({ preset: "yesterday", timezone: "UTC", now })).toMatchObject({ start: "2026-11-08", end: "2026-11-08" });
  });

  it("resolves month boundaries", () => {
    expect(resolveRange({ preset: "this_month", timezone: "UTC", now })).toMatchObject({ start: "2026-11-01", end: "2026-11-09" });
    expect(resolveRange({ preset: "last_month", timezone: "UTC", now })).toMatchObject({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("uses the account timezone for today", () => {
    const range = resolveRange({ preset: "today", timezone: "Pacific/Kiritimati", now: new Date("2026-11-09T12:30:00Z") });
    expect(range.start).toBe("2026-11-10");
  });

  it("rejects missing, malformed, reversed and impossible custom ranges", () => {
    expect(() => resolveRange({ preset: "custom" })).toThrow();
    expect(() => resolveRange({ preset: "custom", start: "2026-11-09", end: "2026-11-01" })).toThrow();
    expect(() => resolveRange({ preset: "custom", start: "2026-02-30", end: "2026-03-01" })).toThrow();
    expect(() => resolveRange({ preset: "nonsense", now })).toThrow();
  });

  it("validates ISO dates and day math", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("09-11-2026")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-01", "2026-11-09")).toBe(9);
  });
});
