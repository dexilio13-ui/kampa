import Link from "next/link";

export const metadata = { title: "Privacy — AdPulse" };

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <p className="privacy-back">
        <Link href="/">← Back to AdPulse</Link>
      </p>
      <h1>Privacy</h1>
      <p>
        AdPulse is a read-only reporting tool. It reads advertising and YouTube analytics data so the account owner can see it in one
        place. It never creates, edits, pauses or deletes campaigns, ads or videos.
      </p>

      <h2>What AdPulse accesses</h2>
      <ul>
        <li>Google Ads: campaigns, ad groups, ads, keywords, products and performance reports for accounts you connect.</li>
        <li>Meta: ad accounts, campaigns, ad sets, ads and Insights reports.</li>
        <li>TikTok: advertiser, campaign, ad group, ad and report data, plus public Ad Library transparency data if approved.</li>
        <li>YouTube: your channel, your videos and your YouTube Analytics reports. Scopes requested are youtube.readonly and
          yt-analytics.readonly; yt-analytics-monetary.readonly is optional and only used for monetized channels.</li>
      </ul>

      <h2>What is stored</h2>
      <p>
        Credentials are kept on the server in an AES-256-GCM encrypted settings file. The browser only ever receives masked values
        showing the last four characters. Advertising performance data is cached in server memory for five minutes.
      </p>
      <p>
        YouTube API data is never written to disk, never exported to CSV and never logged. It is held in memory only and disappears
        when the process restarts or the cache expires.
      </p>

      <h2>What is not done</h2>
      <p>
        AdPulse does not sell data, build advertising profiles, estimate revenue or audience size, rank channels, or combine YouTube
        data with data from any other source. YouTube channel data is excluded from cross-network totals.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Open Settings and use “Disconnect and delete my YouTube data”. AdPulse revokes the Google token, clears every YouTube cache
        entry and deletes the stored YouTube credentials immediately. The general danger zone deletes all stored settings and cached
        data.
      </p>

      <h2>Contact</h2>
      <p>Data deletion requests can also be sent to the person or team who deployed this instance.</p>
    </main>
  );
}
