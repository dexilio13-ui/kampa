export type Network = "google-ads" | "meta" | "tiktok" | "youtube";
export type DataSource = "demo" | "google_ads_api" | "meta_api" | "tiktok_api" | "youtube_api" | "tiktok_adlib";
export type MetricFormat = "currency" | "percent" | "number" | "duration" | "text";
export type Level = "account" | "campaign" | "ad_group" | "ad" | "keyword" | "search_term" | "product" | "video" | "channel" | "asset_group" | "placement";

export interface MetricDef {
  key: string;
  label: string;
  description: string;
  format: MetricFormat;
  higherIsBetter: boolean;
  levels: Level[];
  sourceField: string;
  docUrl: string;
  group: string;
  calculated?: boolean;
  experimental?: boolean;
  actionField?: boolean;
  micros?: boolean;
  requiresMonetization?: boolean;
}

export interface DimensionDef {
  key: string;
  label: string;
  description: string;
  docUrl: string;
}

export interface LevelDef {
  key: Level;
  label: string;
  description: string;
}

export interface Catalog {
  network: Network;
  label: string;
  defaultLevel: Level;
  levels: LevelDef[];
  defaultMetrics: string[];
  groups: string[];
  metrics: MetricDef[];
  dimensions: DimensionDef[];
}

export interface NormalizedRow {
  network: Network;
  level: Level;
  id: string;
  name: string;
  status: string;
  date?: string;
  dims: Record<string, string | number | null>;
  metrics: Record<string, number | string | null>;
  currency: string;
  source: DataSource;
}

export interface TimeSeriesPoint {
  date: string;
  metrics: Record<string, number | null>;
}

export interface AccountRef {
  id: string;
  name: string;
  currency?: string;
  status?: string;
}

export interface DataSet {
  network: Network;
  level: Level;
  currency: string;
  rows: NormalizedRow[];
  totals: Record<string, number | null>;
  previousTotals: Record<string, number | null>;
  series: TimeSeriesPoint[];
  previousSeries: TimeSeriesPoint[];
  source: DataSource;
  accounts: AccountRef[];
  accountId?: string;
  catalog: Catalog;
  notices: string[];
  fetchedAt: string;
}

export interface DateRange {
  preset: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  label: string;
  days: number;
  timezone: string;
}

export type SecretKey =
  | "developerToken"
  | "clientId"
  | "clientSecret"
  | "refreshToken"
  | "accessToken"
  | "appId"
  | "appSecret"
  | "clientKey"
  | "channelId";

export interface GoogleAdsSettings {
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  loginCustomerId?: string;
  customerIds: string[];
  connectedAt?: string;
}

export interface MetaSettings {
  accessToken?: string;
  appId?: string;
  appSecret?: string;
  adAccountIds: string[];
  connectedAt?: string;
}

export interface TikTokSettings {
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  advertiserIds: string[];
  ccClientKey?: string;
  ccClientSecret?: string;
  ccAccessToken?: string;
  connectedAt?: string;
}

export interface YouTubeSettings {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  channelId?: string;
  channelTitle?: string;
  monetized: boolean;
  connectedAt?: string;
}

export interface AppSettings {
  demoMode: boolean;
  timezone: string;
  defaultRange: string;
  reduceMotion: boolean;
  apiVersions: {
    googleAds: string;
    meta: string;
    tiktok: string;
  };
  googleAds: GoogleAdsSettings;
  meta: MetaSettings;
  tiktok: TikTokSettings;
  youtube: YouTubeSettings;
}

export interface MaskedValue {
  isSet: boolean;
  masked: string;
}

export interface PublicSettings {
  demoMode: boolean;
  timezone: string;
  defaultRange: string;
  reduceMotion: boolean;
  apiVersions: AppSettings["apiVersions"];
  googleAds: {
    developerToken: MaskedValue;
    clientId: MaskedValue;
    clientSecret: MaskedValue;
    refreshToken: MaskedValue;
    loginCustomerId: string;
    customerIds: string[];
    connectedAt: string | null;
  };
  meta: {
    accessToken: MaskedValue;
    appId: MaskedValue;
    appSecret: MaskedValue;
    adAccountIds: string[];
    connectedAt: string | null;
  };
  tiktok: {
    appId: MaskedValue;
    appSecret: MaskedValue;
    accessToken: MaskedValue;
    advertiserIds: string[];
    ccClientKey: MaskedValue;
    ccClientSecret: MaskedValue;
    ccAccessToken: MaskedValue;
    connectedAt: string | null;
  };
  youtube: {
    clientId: MaskedValue;
    clientSecret: MaskedValue;
    refreshToken: MaskedValue;
    channelId: string;
    channelTitle: string;
    monetized: boolean;
    connectedAt: string | null;
  };
}
