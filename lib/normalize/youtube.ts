import type { AppCatalog } from "../catalog";
import type { DataSource, Level, NormalizedRow } from "../types";
import { num, str } from "./common";

type Dict = Record<string, any>;

export interface YouTubeColumnHeader {
  name: string;
  dataType?: string;
  columnType?: string;
}

export interface YouTubeTable {
  columnHeaders?: YouTubeColumnHeader[];
  rows?: (string | number)[][];
}

export interface YouTubeVideoMeta {
  id: string;
  title: string;
  status?: string;
  publishedAt?: string;
}

export interface YouTubeChannelMeta {
  id: string;
  title: string;
  status?: string;
}

export function normalizeYouTubeRows(
  table: YouTubeTable,
  options: {
    level: Level;
    channel: YouTubeChannelMeta;
    videos?: YouTubeVideoMeta[];
    catalog: AppCatalog;
    source: DataSource;
    currency?: string;
  },
): NormalizedRow[] {
  const headers = table.columnHeaders ?? [];
  const rows = table.rows ?? [];
  const videoMap = new Map((options.videos ?? []).map((video) => [video.id, video]));
  const out: NormalizedRow[] = [];

  for (const raw of rows) {
    const record: Dict = {};
    headers.forEach((header, index) => {
      record[header.name] = raw[index];
    });

    const videoId = record.video ? str(record.video) : "";
    const video = videoId ? videoMap.get(videoId) : undefined;
    const id = options.level === "video" ? videoId || str(record.video) : options.channel.id;
    const name = options.level === "video" ? (video?.title ?? (videoId || "Video")) : options.channel.title;

    const metrics: Record<string, number | null> = {};
    for (const def of options.catalog.metrics) {
      metrics[def.key] = num(record[def.sourceField]);
    }

    out.push({
      network: "youtube",
      level: options.level,
      id: id || "channel",
      name: name || "YouTube channel",
      status: video?.status ?? options.channel.status ?? "",
      date: record.day ? str(record.day) : undefined,
      dims: {
        video: videoId || null,
        video_title: video?.title ?? null,
        published_at: video?.publishedAt ?? null,
        country: record.country ? str(record.country) : null,
        age_group: record.ageGroup ? str(record.ageGroup) : null,
        gender: record.gender ? str(record.gender) : null,
        traffic_source: record.trafficSource ? str(record.trafficSource) : null,
        device_type: record.deviceType ? str(record.deviceType) : null,
        playback_location: record.playbackLocation ? str(record.playbackLocation) : null,
      },
      metrics,
      currency: options.currency ?? "USD",
      source: options.source,
    });
  }

  return out;
}

export function dailyYouTubeSeries(rows: NormalizedRow[]): { date: string; metrics: Record<string, number | null> }[] {
  const byDate = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    if (!row.date) continue;
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const metrics: Record<string, number | null> = {};
      for (const key of Object.keys(list[0]?.metrics ?? {})) {
        let total = 0;
        let any = false;
        for (const row of list) {
          const value = row.metrics[key];
          if (typeof value === "number") {
            total += value;
            any = true;
          }
        }
        metrics[key] = any ? total : null;
      }
      return { date, metrics };
    });
}
