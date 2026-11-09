import { AppError } from "./errors";
import type { DateRange } from "./types";

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7d", label: "Last 7 days" },
  { key: "last_14d", label: "Last 14 days" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "last_90d", label: "Last 90 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "custom", label: "Custom" },
] as const;

export type PresetKey = (typeof PRESETS)[number]["key"];

function partsInTimezone(date: Date, timezone: string): { year: number; month: number; day: number } {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day") };
  } catch {
    const iso = date.toISOString().slice(0, 10).split("-").map(Number);
    return { year: iso[0], month: iso[1], day: iso[2] };
  }
}

export function todayInTimezone(timezone: string, now = new Date()): string {
  const { year, month, day } = partsInTimezone(now, timezone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toUtcDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(iso: string, delta: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86_400_000) + 1;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = toUtcDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export interface ResolveRangeInput {
  preset?: string;
  start?: string;
  end?: string;
  timezone?: string;
  now?: Date;
}

export function resolveRange(input: ResolveRangeInput = {}): DateRange {
  const timezone = input.timezone || "UTC";
  const preset = (input.preset || "last_7d") as PresetKey;
  const today = todayInTimezone(timezone, input.now ?? new Date());
  let start = today;
  let end = today;

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      start = addDays(today, -1);
      end = start;
      break;
    case "last_7d":
      start = addDays(today, -6);
      break;
    case "last_14d":
      start = addDays(today, -13);
      break;
    case "last_30d":
      start = addDays(today, -29);
      break;
    case "last_90d":
      start = addDays(today, -89);
      break;
    case "this_month":
      start = monthStart(today);
      break;
    case "last_month": {
      const firstThisMonth = toUtcDate(monthStart(today));
      const lastMonthEnd = new Date(firstThisMonth.getTime() - 86_400_000);
      end = lastMonthEnd.toISOString().slice(0, 10);
      start = monthStart(end);
      break;
    }
    case "custom": {
      if (!input.start || !input.end || !isValidIsoDate(input.start) || !isValidIsoDate(input.end)) {
        throw new AppError("CONFIG", { detail: "A custom range needs valid start and end dates." });
      }
      if (input.start > input.end) {
        throw new AppError("CONFIG", { detail: "The custom start date must be before the end date." });
      }
      start = input.start;
      end = input.end;
      break;
    }
    default:
      throw new AppError("CONFIG", { detail: "Unknown date range." });
  }

  const days = daysBetween(start, end);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  const matched = PRESETS.find((item) => item.key === preset);

  return {
    preset,
    start,
    end,
    previousStart,
    previousEnd,
    label: preset === "custom" ? `${start} to ${end}` : (matched?.label ?? preset),
    days,
    timezone,
  };
}

export function dateSeries(start: string, end: string): string[] {
  const days = daysBetween(start, end);
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}
