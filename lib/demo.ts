import { dateSeries } from "./dates";
import type { DateRange, Level } from "./types";

type Dict = Record<string, any>;

export interface DemoGoogle {
  results: Dict[];
  accounts: { id: string; name: string; currency: string; status: string; timeZone: string }[];
  summary: Dict;
  adGroups: string[];
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function factor(date: string, seed: number): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6 ? 0.78 : 1;
  const rand = rng(seed + hash(date))();
  return weekend * (0.82 + rand * 0.36);
}

function round(value: number, digits = 2): number {
  const factorValue = 10 ** digits;
  return Math.round(value * factorValue) / factorValue;
}

function money(value: number): number {
  return round(value, 2);
}

const GOOGLE_ACCOUNTS = [
  { id: "demo-google-1001", name: "Northwind Home (Demo)", currency: "USD", status: "ENABLED", timeZone: "America/New_York" },
  { id: "demo-google-1002", name: "Northwind Outdoors (Demo)", currency: "USD", status: "ENABLED", timeZone: "America/Los_Angeles" },
];

interface GoogleCampaign {
  id: string;
  name: string;
  channel: "SEARCH" | "PERFORMANCE_MAX" | "DEMAND_GEN" | "SHOPPING" | "VIDEO";
  subtab: "search" | "pmax" | "demand_gen" | "shopping" | "video";
  status: string;
  base: { impressions: number; ctr: number; cpc: number; cvr: number; aov: number };
}

const GOOGLE_CAMPAIGNS: GoogleCampaign[] = [
  { id: "g-search-brand", name: "Search — Brand", channel: "SEARCH", subtab: "search", status: "ENABLED", base: { impressions: 8200, ctr: 8.4, cpc: 0.42, cvr: 7.2, aov: 72 } },
  { id: "g-search-nonbrand", name: "Search — Non-brand", channel: "SEARCH", subtab: "search", status: "ENABLED", base: { impressions: 19400, ctr: 4.1, cpc: 1.35, cvr: 2.9, aov: 68 } },
  { id: "g-search-comp", name: "Search — Competitors", channel: "SEARCH", subtab: "search", status: "PAUSED", base: { impressions: 6100, ctr: 2.8, cpc: 1.92, cvr: 1.6, aov: 61 } },
  { id: "g-pmax-core", name: "Performance Max — Core catalogue", channel: "PERFORMANCE_MAX", subtab: "pmax", status: "ENABLED", base: { impressions: 48000, ctr: 2.3, cpc: 0.86, cvr: 2.4, aov: 74 } },
  { id: "g-pmax-new", name: "PMax — New arrivals", channel: "PERFORMANCE_MAX", subtab: "pmax", status: "ENABLED", base: { impressions: 21500, ctr: 1.9, cpc: 0.94, cvr: 1.7, aov: 82 } },
  { id: "g-dg-prospect", name: "Demand Gen — Prospecting", channel: "DEMAND_GEN", subtab: "demand_gen", status: "ENABLED", base: { impressions: 36200, ctr: 1.4, cpc: 0.58, cvr: 1.1, aov: 69 } },
  { id: "g-dg-return", name: "Demand Gen — Retargeting", channel: "DEMAND_GEN", subtab: "demand_gen", status: "ENABLED", base: { impressions: 12800, ctr: 3.2, cpc: 0.72, cvr: 4.6, aov: 91 } },
  { id: "g-shop-core", name: "Shopping — Core catalogue", channel: "SHOPPING", subtab: "shopping", status: "ENABLED", base: { impressions: 27600, ctr: 2.7, cpc: 0.64, cvr: 3.1, aov: 58 } },
  { id: "g-shop-clear", name: "Shopping — Clearance", channel: "SHOPPING", subtab: "shopping", status: "ENABLED", base: { impressions: 9800, ctr: 3.5, cpc: 0.48, cvr: 4.2, aov: 34 } },
  { id: "g-video-brand", name: "Video — Brand story", channel: "VIDEO", subtab: "video", status: "ENABLED", base: { impressions: 118000, ctr: 0.42, cpc: 0.11, cvr: 0.4, aov: 76 } },
  { id: "g-video-demo", name: "Video — Product demo", channel: "VIDEO", subtab: "video", status: "ENABLED", base: { impressions: 64000, ctr: 0.61, cpc: 0.15, cvr: 0.8, aov: 79 } },
];

function googleMetrics(campaign: GoogleCampaign, seed: string, date: string, level: Level): Dict {
  const r = rng(hash(`${seed}:${date}`));
  const f = factor(date, hash(campaign.id));
  const levelScale = level === "campaign" ? 1 : level === "ad_group" ? 0.32 : level === "ad" ? 0.18 : level === "keyword" ? 0.09 : level === "search_term" ? 0.05 : level === "product" ? 0.16 : 0.3;
  const impressions = Math.max(1, Math.round(campaign.base.impressions * f * levelScale * (0.9 + r() * 0.2)));
  const ctrPercent = campaign.base.ctr * (0.9 + r() * 0.2);
  const clicks = Math.max(0, Math.round((impressions * ctrPercent) / 100));
  const cpc = campaign.base.cpc * (0.9 + r() * 0.2);
  const cost = clicks * cpc;
  const cvr = campaign.base.cvr * (0.85 + r() * 0.3);
  const conversions = round((clicks * cvr) / 100, 2);
  const value = conversions * campaign.base.aov;
  const videoViews = campaign.channel === "VIDEO" ? impressions * (0.26 + r() * 0.06) : 0;
  const interactions = clicks + (campaign.channel === "VIDEO" ? videoViews : 0) * 0.12;

  const values: Record<string, number> = {
    impressions,
    clicks,
    cost: money(cost),
    ctr: round(ctrPercent, 3),
    average_cpc: money(cpc),
    average_cpm: money((cost / impressions) * 1000),
    interactions: Math.round(interactions),
    interaction_rate: round((interactions / impressions) * 100, 3),
    conversions,
    conversions_value: money(value),
    cost_per_conversion: conversions ? money(cost / conversions) : 0,
    value_per_conversion: conversions ? money(value / conversions) : 0,
    all_conversions: round(conversions * 1.18, 2),
    all_conversions_value: money(value * 1.22),
    view_through_conversions: round(conversions * 0.12, 2),
    cross_device_conversions: round(conversions * 0.09, 2),
    search_impression_share: round(52 + r() * 22, 2),
    search_top_impression_share: round(31 + r() * 16, 2),
    search_absolute_top_impression_share: round(17 + r() * 13, 2),
    search_budget_lost_impression_share: round(4 + r() * 9, 2),
    search_rank_lost_impression_share: round(3 + r() * 8, 2),
    content_impression_share: round(44 + r() * 24, 2),
    video_views: Math.round(videoViews),
    video_view_rate: videoViews ? round((videoViews / impressions) * 100, 3) : 0,
    average_cpv: videoViews ? money(cost / videoViews) : 0,
    video_quartile_25_rate: videoViews ? round(58 + r() * 10, 2) : 0,
    video_quartile_50_rate: videoViews ? round(38 + r() * 9, 2) : 0,
    video_quartile_75_rate: videoViews ? round(23 + r() * 7, 2) : 0,
    video_quartile_100_rate: videoViews ? round(13 + r() * 5, 2) : 0,
    engagements: Math.round(impressions * (0.008 + r() * 0.012)),
    engagement_rate: round(0.8 + r() * 1.2, 3),
    phone_calls: Math.round(conversions * 0.08),
    store_visits: Math.round(conversions * 0.05),
    orders: round(conversions * 1.05, 2),
    units_sold: round(conversions * 1.48, 2),
    average_order_value: money(campaign.base.aov * (0.92 + r() * 0.16)),
    gross_profit: money(value * 0.35),
    gross_profit_margin: round(34 + r() * 6, 2),
    cost_of_goods_sold: money(value * 0.65),
    historical_quality_score: Math.round(6 + r() * 3),
  };

  const raw: Dict = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "cost") raw.cost_micros = Math.round(value * 1_000_000);
    else if (["average_cpc", "average_cpm", "cost_per_conversion", "average_cpv"].includes(key)) {
      raw[key] = Math.round(value * 1_000_000);
    } else if (["ctr", "interaction_rate", "video_view_rate", "engagement_rate", "search_impression_share", "search_top_impression_share", "search_absolute_top_impression_share", "search_budget_lost_impression_share", "search_rank_lost_impression_share", "content_impression_share", "video_quartile_25_rate", "video_quartile_50_rate", "video_quartile_75_rate", "video_quartile_100_rate", "gross_profit_margin"].includes(key)) {
      raw[key] = value / 100;
    } else {
      raw[key] = value;
    }
  }
  return raw;
}

export function demoGoogle(accountId: string, subtab: string, level: Level, range: DateRange): DemoGoogle {
  const account = GOOGLE_ACCOUNTS.find((item) => item.id === accountId) ?? GOOGLE_ACCOUNTS[0];
  const campaigns = subtab === "all" ? GOOGLE_CAMPAIGNS : GOOGLE_CAMPAIGNS.filter((campaign) => campaign.subtab === subtab);
  const dates = dateSeries(range.start, range.end);
  const results: Dict[] = [];
  const adGroups: string[] = [];

  for (const campaign of campaigns) {
    for (const date of dates) {
      const baseRow = {
        campaign: {
          id: campaign.id,
          name: `${campaign.name}${account.id.endsWith("1002") ? " · Outdoors" : ""}`,
          status: campaign.status,
          advertisingChannelType: campaign.channel,
        },
        segments: { date, device: "DESKTOP", adNetworkType: campaign.channel === "SEARCH" ? "SEARCH" : "CONTENT" },
      };

      if (level === "campaign") {
        results.push({ ...baseRow, metrics: googleMetrics(campaign, campaign.id, date, level) });
      } else if (level === "ad_group") {
        for (let index = 0; index < 3; index += 1) {
          const name = `${campaign.name} · Ad group ${index + 1}`;
          adGroups.push(name);
          results.push({
            ...baseRow,
            adGroup: { id: `${campaign.id}-ag${index + 1}`, name, status: "ENABLED" },
            metrics: googleMetrics(campaign, `${campaign.id}-ag${index + 1}`, date, level),
          });
        }
      } else if (level === "keyword") {
        const keywords = ["brand running shoes", "trail shoes sale", "waterproof hiking boots", "lightweight trainers"];
        keywords.forEach((keyword, index) => {
          results.push({
            ...baseRow,
            adGroupCriterion: { criterionId: `${campaign.id}-kw${index + 1}`, keyword: { text: keyword }, status: "ENABLED" },
            metrics: googleMetrics(campaign, `${campaign.id}-${keyword}`, date, level),
          });
        });
      } else if (level === "search_term") {
        const terms = ["northwind running shoes", "trail shoes near me", "best waterproof boots", "northwind discount code"];
        terms.forEach((term, index) => {
          results.push({
            ...baseRow,
            searchTermView: { searchTerm: term, searchTermMatchType: index === 0 ? "EXACT" : "BROAD" },
            metrics: googleMetrics(campaign, `${campaign.id}-${term}`, date, level),
          });
        });
      } else if (level === "product") {
        const products = ["Trail Runner 2", "Summit Boot", "Rain Shell", "Everyday Trainer"];
        products.forEach((product, index) => {
          results.push({
            ...baseRow,
            shoppingPerformanceView: { productId: `${campaign.id}-p${index + 1}`, productTitle: product, status: "ENABLED" },
            metrics: googleMetrics(campaign, `${campaign.id}-${product}`, date, level),
          });
        });
      } else if (level === "asset_group") {
        for (let index = 0; index < 3; index += 1) {
          results.push({
            ...baseRow,
            assetGroup: { id: `${campaign.id}-asg${index + 1}`, name: `Asset group ${index + 1}`, status: "ENABLED" },
            metrics: googleMetrics(campaign, `${campaign.id}-asg${index + 1}`, date, level),
          });
        }
      } else if (level === "ad") {
        for (let index = 0; index < 2; index += 1) {
          results.push({
            ...baseRow,
            adGroupAd: { ad: { id: `${campaign.id}-ad${index + 1}`, name: `Ad ${index + 1}` }, status: "ENABLED" },
            metrics: googleMetrics(campaign, `${campaign.id}-ad${index + 1}`, date, level),
          });
        }
      }
    }
  }

  const summary = {
    customer: { id: account.id, descriptiveName: account.name, currencyCode: account.currency, timeZone: account.timeZone, status: "ENABLED" },
    budgets: campaigns.map((campaign) => ({
      campaign: campaign.name,
      budget: money(campaign.base.impressions * 0.02),
      biddingStrategy: campaign.channel === "SEARCH" ? "MAXIMIZE_CONVERSIONS" : "MAXIMIZE_CONVERSION_VALUE",
      status: campaign.status,
    })),
    conversionActions: [
      { name: "Purchase", category: "PURCHASE", status: "ENABLED", primary: true },
      { name: "Newsletter sign-up", category: "SUBSCRIBE", status: "ENABLED", primary: false },
      { name: "Add to cart", category: "ADD_TO_CART", status: "ENABLED", primary: false },
    ],
  };

  return {
    results,
    accounts: GOOGLE_ACCOUNTS.map(({ id, name, currency, status, timeZone }) => ({ id, name, currency, status, timeZone })),
    summary,
    adGroups: [...new Set(adGroups)],
  };
}

const META_CAMPAIGNS = [
  { id: "m-prospect", name: "Prospecting — Broad", base: { impressions: 68000, ctr: 1.1, cpm: 8.4, cvr: 1.2, aov: 74 }, objective: "OUTCOME_SALES" },
  { id: "m-retarget", name: "Retargeting — 30 days", base: { impressions: 22000, ctr: 2.8, cpm: 12.2, cvr: 4.4, aov: 88 }, objective: "OUTCOME_SALES" },
  { id: "m-lead", name: "Lead form — Demo bookings", base: { impressions: 31000, ctr: 1.6, cpm: 7.1, cvr: 3.1, aov: 45 }, objective: "OUTCOME_LEADS" },
  { id: "m-reels", name: "Reels — Creator collab", base: { impressions: 94000, ctr: 0.9, cpm: 5.8, cvr: 0.8, aov: 61 }, objective: "OUTCOME_AWARENESS" },
];

function metaMetrics(campaign: (typeof META_CAMPAIGNS)[number], seed: string, date: string, platform: "facebook" | "instagram", level: Level): Dict {
  const r = rng(hash(`${seed}:${date}:${platform}`));
  const f = factor(date, hash(campaign.id));
  const platformScale = platform === "instagram" ? 0.58 : 1;
  const levelScale = level === "campaign" ? 1 : level === "ad_group" ? 0.4 : level === "ad" ? 0.22 : 1;
  const impressions = Math.max(1, Math.round(campaign.base.impressions * f * platformScale * levelScale * (0.9 + r() * 0.2)));
  const ctr = campaign.base.ctr * (0.9 + r() * 0.2);
  const clicks = Math.max(0, Math.round((impressions * ctr) / 100));
  const spend = money((impressions / 1000) * campaign.base.cpm * (0.92 + r() * 0.16));
  const reach = Math.max(1, Math.round(impressions / (1.8 + r() * 0.7)));
  const purchases = round((clicks * campaign.base.cvr) / 100, 2);
  const leads = round(clicks * 0.018, 2);
  const value = money(purchases * campaign.base.aov);
  const linkClicks = Math.round(clicks * 0.86);
  const videoPlays = Math.round(impressions * 0.21);
  const thruplay = Math.round(videoPlays * 0.31);

  return {
    account_id: "demo-meta-2001",
    account_name: "Northwind Social (Demo)",
    account_currency: "USD",
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    adset_id: `${campaign.id}-set`,
    adset_name: `${campaign.name} · Set`,
    ad_id: `${campaign.id}-ad`,
    ad_name: `${campaign.name} · Ad`,
    date_start: date,
    date_stop: date,
    publisher_platform: platform,
    platform_position: platform === "instagram" ? (r() > 0.5 ? "instagram_reels" : "instagram_feed") : "feed",
    device_platform: r() > 0.25 ? "mobile" : "desktop",
    impressions,
    reach,
    frequency: round(impressions / reach, 2),
    spend,
    clicks,
    unique_clicks: Math.round(clicks * 0.87),
    inline_link_clicks: linkClicks,
    inline_link_click_ctr: round((linkClicks / impressions) * 100, 3),
    ctr: round((clicks / impressions) * 100, 3),
    cpc: clicks ? money(spend / clicks) : 0,
    cpm: money((spend / impressions) * 1000),
    cpp: money((spend / reach) * 1000),
    actions: [
      { action_type: "purchase", value: String(purchases) },
      { action_type: "lead", value: String(leads) },
      { action_type: "link_click", value: String(linkClicks) },
      { action_type: "landing_page_view", value: String(Math.round(linkClicks * 0.73)) },
      { action_type: "add_to_cart", value: String(Math.round(purchases * 2.4)) },
    ],
    action_values: [{ action_type: "purchase", value: String(value) }],
    cost_per_action_type: [
      { action_type: "purchase", value: String(purchases ? money(spend / purchases) : 0) },
      { action_type: "lead", value: String(leads ? money(spend / leads) : 0) },
    ],
    purchase_roas: [{ action_type: "omni_purchase", value: String(spend ? round(value / spend, 2) : 0) }],
    video_play_actions: [{ action_type: "video_view", value: String(videoPlays) }],
    video_thruplay_watched_actions: [{ action_type: "video_view", value: String(thruplay) }],
    video_p25_watched_actions: [{ action_type: "video_view", value: String(Math.round(videoPlays * 0.58)) }],
    video_p50_watched_actions: [{ action_type: "video_view", value: String(Math.round(videoPlays * 0.4)) }],
    video_p75_watched_actions: [{ action_type: "video_view", value: String(Math.round(videoPlays * 0.24)) }],
    video_p95_watched_actions: [{ action_type: "video_view", value: String(Math.round(videoPlays * 0.12)) }],
    video_p100_watched_actions: [{ action_type: "video_view", value: String(Math.round(videoPlays * 0.09)) }],
    quality_ranking: "ABOVE_AVERAGE",
    engagement_rate_ranking: "AVERAGE",
    conversion_rate_ranking: "ABOVE_AVERAGE",
    objective: campaign.objective,
    optimization_goal: campaign.objective === "OUTCOME_LEADS" ? "LEAD_GENERATION" : "OFFSITE_CONVERSIONS",
    effective_status: "ACTIVE",
  };
}

function mergeMetaPlatforms(fb: Dict, ig: Dict): Dict {
  const impressions = fb.impressions + ig.impressions;
  const clicks = fb.clicks + ig.clicks;
  const spend = money(fb.spend + ig.spend);
  const reach = Math.round(fb.reach + ig.reach * 0.55);
  const purchases = Number(fb.actions[0].value) + Number(ig.actions[0].value);
  const value = Number(fb.action_values[0].value) + Number(ig.action_values[0].value);
  return {
    ...fb,
    publisher_platform: "",
    impressions,
    clicks,
    spend,
    reach,
    frequency: round(impressions / reach, 2),
    ctr: round((clicks / impressions) * 100, 3),
    inline_link_clicks: fb.inline_link_clicks + ig.inline_link_clicks,
    inline_link_click_ctr: round(((fb.inline_link_clicks + ig.inline_link_clicks) / impressions) * 100, 3),
    cpc: money(spend / clicks),
    cpm: money((spend / impressions) * 1000),
    cpp: money((spend / reach) * 1000),
    actions: [
      { action_type: "purchase", value: String(round(purchases, 2)) },
      { action_type: "lead", value: String(round(Number(fb.actions[1].value) + Number(ig.actions[1].value), 2)) },
      { action_type: "link_click", value: String(fb.inline_link_clicks + ig.inline_link_clicks) },
    ],
    action_values: [{ action_type: "purchase", value: String(money(value)) }],
    cost_per_action_type: [{ action_type: "purchase", value: String(purchases ? money(spend / purchases) : 0) }],
    purchase_roas: [{ action_type: "omni_purchase", value: String(spend ? round(value / spend, 2) : 0) }],
  };
}

export function demoMeta(level: Level, platform: "facebook" | "instagram" | "both", range: DateRange): { data: Dict[]; accounts: Dict[]; breakdowns: Dict[] } {
  const dates = dateSeries(range.start, range.end);
  const data: Dict[] = [];
  const breakdowns: Dict[] = [];
  const platformTotals = {
    facebook: { impressions: 0, clicks: 0, spend: 0 },
    instagram: { impressions: 0, clicks: 0, spend: 0 },
  };

  for (const campaign of META_CAMPAIGNS) {
    for (const date of dates) {
      const fb = metaMetrics(campaign, campaign.id, date, "facebook", level);
      const ig = metaMetrics(campaign, campaign.id, date, "instagram", level);
      platformTotals.facebook.impressions += fb.impressions;
      platformTotals.facebook.clicks += fb.clicks;
      platformTotals.facebook.spend += fb.spend;
      platformTotals.instagram.impressions += ig.impressions;
      platformTotals.instagram.clicks += ig.clicks;
      platformTotals.instagram.spend += ig.spend;
      if (platform === "both") data.push(mergeMetaPlatforms(fb, ig));
      else data.push(platform === "facebook" ? fb : ig);
    }
  }

  breakdowns.push(
    { platform: "Facebook", ...platformTotals.facebook, spend: money(platformTotals.facebook.spend) },
    { platform: "Instagram", ...platformTotals.instagram, spend: money(platformTotals.instagram.spend) },
  );

  return {
    data,
    breakdowns,
    accounts: [{ id: "act_2001", account_id: "2001", name: "Northwind Social (Demo)", currency: "USD", account_status: 1 }],
  };
}

const TIKTOK_CAMPAIGNS = [
  { id: "tt-prospect", name: "Spark Ads — Prospecting", base: { impressions: 54000, ctr: 1.8, cpm: 4.6, cvr: 1.6, aov: 52 } },
  { id: "tt-retarget", name: "Retargeting — Viewers 7d", base: { impressions: 18000, ctr: 3.1, cpm: 6.1, cvr: 4.2, aov: 66 } },
  { id: "tt-creator", name: "Creator whitelisting", base: { impressions: 72000, ctr: 1.2, cpm: 3.8, cvr: 0.9, aov: 48 } },
];

function tiktokMetrics(campaign: (typeof TIKTOK_CAMPAIGNS)[number], seed: string, date: string, level: Level): Dict {
  const r = rng(hash(`${seed}:${date}`));
  const f = factor(date, hash(campaign.id));
  const levelScale = level === "campaign" ? 1 : level === "ad_group" ? 0.36 : 0.2;
  const impressions = Math.max(1, Math.round(campaign.base.impressions * f * levelScale * (0.9 + r() * 0.2)));
  const clicks = Math.max(0, Math.round((impressions * campaign.base.ctr * (0.9 + r() * 0.2)) / 100));
  const spend = money((impressions / 1000) * campaign.base.cpm * (0.92 + r() * 0.16));
  const reach = Math.round(impressions / (1.6 + r() * 0.5));
  const conversions = round((clicks * campaign.base.cvr) / 100, 2);
  const plays = Math.round(impressions * 0.32);

  return {
    advertiser_name: "Northwind TikTok (Demo)",
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    adgroup_id: `${campaign.id}-ag`,
    adgroup_name: `${campaign.name} · Ad group`,
    ad_id: `${campaign.id}-ad`,
    ad_name: `${campaign.name} · Ad`,
    spend,
    impressions,
    reach,
    frequency: round(impressions / reach, 2),
    clicks,
    ctr: round((clicks / impressions) * 100, 3),
    cpc: clicks ? money(spend / clicks) : 0,
    cpm: money((spend / impressions) * 1000),
    conversion: conversions,
    cost_per_conversion: conversions ? money(spend / conversions) : 0,
    conversion_rate: clicks ? round((conversions / clicks) * 100, 3) : 0,
    video_play_actions: plays,
    video_watched_2s: Math.round(plays * 0.74),
    video_watched_6s: Math.round(plays * 0.45),
    average_video_play: round(6.4 + r() * 4, 2),
    video_views_p25: Math.round(plays * 0.52),
    video_views_p50: Math.round(plays * 0.33),
    video_views_p75: Math.round(plays * 0.21),
    video_views_p100: Math.round(plays * 0.12),
    likes: Math.round(impressions * 0.013),
    comments: Math.round(impressions * 0.0014),
    shares: Math.round(impressions * 0.0009),
    follows: Math.round(impressions * 0.0011),
    profile_visits: Math.round(impressions * 0.0026),
    currency: "USD",
    stat_time_day: date,
  };
}

export function demoTikTok(level: Level, range: DateRange): { list: Dict[]; advertisers: Dict[]; reportTypes: string[] } {
  const dates = dateSeries(range.start, range.end);
  const list: Dict[] = [];
  for (const campaign of TIKTOK_CAMPAIGNS) {
    for (const date of dates) {
      const metrics = tiktokMetrics(campaign, campaign.id, date, level);
      list.push({
        dimensions: {
          advertiser_id: "demo-tiktok-3001",
          campaign_id: campaign.id,
          adgroup_id: `${campaign.id}-ag`,
          ad_id: `${campaign.id}-ad`,
          stat_time_day: date,
        },
        metrics,
      });
    }
  }
  return {
    list,
    advertisers: [{ advertiser_id: "demo-tiktok-3001", advertiser_name: "Northwind TikTok (Demo)", currency: "USD", status: "ENABLE" }],
    reportTypes: ["BASIC", "AUDIENCE"],
  };
}

export function demoAdLibrary() {
  return {
    demo: true,
    ads: [
      {
        ad: {
          id: "7310000000000000001",
          first_shown_date: "20260914",
          last_shown_date: "20261107",
          status: "active",
          title: "Trail season is here",
          call_to_action: "Shop now",
          advertising_objective: "Sales",
          image_urls: [],
          videos: [],
          reach: {
            unique_users_seen: "250K",
            unique_users_seen_by_country: { GB: "150K", FR: "100K" },
            unique_users_seen_breakdowns: [
              { region: "GB", unique_users_seen: "150K", breakdowns: [{ age: "25-34", gender: "FEMALE", unique_users_seen: "80K" }] },
            ],
          },
        },
        advertiser: { business_id: 90001, business_name: "Northwind Outdoors", country_code: "GB", paid_by: "Northwind Outdoors" },
        ad_group: { targeting_info: { number_of_users_targeted: "500K", country: ["GB", "FR"], age: { "18-24": true, "25-34": true, "35-44": true }, gender: { female: true, male: true } } },
      },
      {
        ad: {
          id: "7310000000000000002",
          first_shown_date: "20261001",
          last_shown_date: "20261106",
          status: "active",
          title: "Made for muddy mornings",
          call_to_action: "Learn more",
          advertising_objective: "Traffic",
          image_urls: [],
          videos: [],
          reach: { unique_users_seen: "120K", unique_users_seen_breakdowns: [] },
        },
        advertiser: { business_id: 90002, business_name: "Northwind Europe", country_code: "DE", paid_by: "Northwind Europe" },
        ad_group: { targeting_info: { number_of_users_targeted: "250K", country: ["DE"], age: { "25-34": true, "35-44": true }, gender: { female: true, male: true } } },
      },
    ],
    report: { dates: ["20261027", "20261028", "20261029", "20261030", "20261031"], counts: [42, 51, 47, 55, 61] },
    advertisers: [{ business_id: 90001, business_name: "Northwind Outdoors", country_code: "GB" }],
    note: "Public transparency data only. Reach is shown as ranges; there is no spend, click or conversion data here.",
  };
}

const YOUTUBE_VIDEOS = [
  { id: "yt-demo-trail", title: "How we test trail shoes in the rain", status: "public", publishedAt: "2026-08-14T10:00:00Z", base: { views: 3200, duration: 412, percentage: 44 } },
  { id: "yt-demo-pack", title: "Packing light for a weekend hike", status: "public", publishedAt: "2026-09-02T09:00:00Z", base: { views: 1800, duration: 286, percentage: 38 } },
  { id: "yt-demo-factory", title: "Inside the Northwind workshop", status: "public", publishedAt: "2026-09-28T14:00:00Z", base: { views: 950, duration: 531, percentage: 51 } },
  { id: "yt-demo-care", title: "Cleaning and caring for hiking boots", status: "public", publishedAt: "2026-10-19T11:00:00Z", base: { views: 2400, duration: 344, percentage: 47 } },
];

function youtubeMetrics(video: (typeof YOUTUBE_VIDEOS)[number], seed: string, date: string): Dict {
  const r = rng(hash(`${seed}:${date}`));
  const f = factor(date, hash(video.id));
  const views = Math.max(1, Math.round(video.base.views * f * (0.9 + r() * 0.2)));
  const avgDuration = video.base.duration * (0.38 + r() * 0.1);
  const watchMinutes = Math.round((views * avgDuration) / 60);
  return {
    views,
    engagedViews: Math.round(views * 1.04),
    viewerPercentage: round(62 + r() * 12, 2),
    estimatedMinutesWatched: watchMinutes,
    averageViewDuration: Math.round(avgDuration),
    averageViewPercentage: round(video.base.percentage + r() * 6, 2),
    likes: Math.round(views * 0.041),
    dislikes: Math.round(views * 0.0012),
    comments: Math.round(views * 0.0046),
    shares: Math.round(views * 0.0021),
    subscribersGained: Math.round(views * 0.0034),
    subscribersLost: Math.round(views * 0.0006),
    videosAddedToPlaylists: Math.round(views * 0.0028),
    videosRemovedFromPlaylists: Math.round(views * 0.0004),
    cardImpressions: Math.round(views * 0.18),
    cardClicks: Math.round(views * 0.012),
    cardClickRate: round(6.4 + r() * 2, 2),
    estimatedRevenue: 0,
    estimatedAdRevenue: 0,
    grossRevenue: 0,
    cpm: 0,
    adImpressions: 0,
    monetizedPlaybacks: 0,
    playbackBasedCpm: 0,
  };
}

export function demoYouTube(range: DateRange) {
  const dates = dateSeries(range.start, range.end);
  const videoDaily: Dict[] = [];
  for (const video of YOUTUBE_VIDEOS) {
    for (const date of dates) {
      videoDaily.push({ video: video.id, day: date, ...youtubeMetrics(video, video.id, date) });
    }
  }

  const channel: Dict = {
    id: "UCdemoNorthwind",
    title: "Northwind Outdoors (Demo)",
    status: "public",
    country: "US",
    subscriberCount: 18420,
    viewCount: 1920000,
    videoCount: YOUTUBE_VIDEOS.length,
  };

  const channelRows: Dict[] = [];
  for (const date of dates) {
    const totals: Dict = { day: date };
    for (const key of ["views", "engagedViews", "estimatedMinutesWatched", "likes", "dislikes", "comments", "shares", "subscribersGained", "subscribersLost", "videosAddedToPlaylists", "videosRemovedFromPlaylists", "cardImpressions", "cardClicks"]) {
      totals[key] = videoDaily.filter((row) => row.day === date).reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
    }
    totals.averageViewDuration = totals.views ? Math.round((totals.estimatedMinutesWatched * 60) / totals.views) : 0;
    totals.averageViewPercentage = round(videoDaily.filter((row) => row.day === date).reduce((sum, row) => sum + Number(row.averageViewPercentage), 0) / YOUTUBE_VIDEOS.length, 2);
    totals.viewerPercentage = 68.4;
    totals.cardClickRate = totals.cardImpressions ? round((totals.cardClicks / totals.cardImpressions) * 100, 2) : 0;
    channelRows.push(totals);
  }

  const videoTotals = YOUTUBE_VIDEOS.map((video) => {
    const rows = videoDaily.filter((row) => row.video === video.id);
    const total: Dict = { video: video.id };
    for (const key of ["views", "engagedViews", "estimatedMinutesWatched", "likes", "dislikes", "comments", "shares", "subscribersGained", "subscribersLost", "videosAddedToPlaylists", "videosRemovedFromPlaylists", "cardImpressions", "cardClicks"]) {
      total[key] = rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
    }
    total.averageViewDuration = total.views ? Math.round((total.estimatedMinutesWatched * 60) / total.views) : 0;
    total.averageViewPercentage = round(rows.reduce((sum, row) => sum + Number(row.averageViewPercentage), 0) / rows.length, 2);
    total.cardClickRate = total.cardImpressions ? round((total.cardClicks / total.cardImpressions) * 100, 2) : 0;
    return total;
  });

  return {
    channel,
    videos: YOUTUBE_VIDEOS.map(({ id, title, status, publishedAt }) => ({ id, title, status, publishedAt })),
    channelRows,
    videoDaily,
    videoTotals,
  };
}
