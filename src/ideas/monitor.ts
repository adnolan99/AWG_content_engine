import Parser from "rss-parser";
import { loadConfig } from "../config.js";
import { insertIdea, getDb } from "../queue/db.js";

const parser = new Parser();

export async function monitorFeeds(): Promise<number> {
  const config = loadConfig();
  const keywords = config.monitoring.keywords.map((k) => k.toLowerCase());
  let newIdeas = 0;

  for (const feedUrl of config.monitoring.rss_feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);

      for (const item of feed.items) {
        const title = item.title ?? "";
        const link = item.link ?? "";

        // Skip if we already have this URL
        const existing = getDb()
          .prepare("SELECT id FROM ideas WHERE url = ?")
          .get(link);
        if (existing) continue;

        // Score relevance based on keyword matches
        const titleLower = title.toLowerCase();
        const snippet = (item.contentSnippet ?? "").toLowerCase();
        const combined = `${titleLower} ${snippet}`;

        let score = 0;
        const matchedKeywords: string[] = [];
        for (const kw of keywords) {
          if (combined.includes(kw)) {
            score += 1;
            matchedKeywords.push(kw);
          }
        }

        // Only store items with at least one keyword match
        if (score > 0) {
          insertIdea({
            title,
            source: feed.title ?? feedUrl,
            url: link,
            keywords: matchedKeywords.join(", "),
            relevance_score: score,
          });
          newIdeas++;
        }
      }
    } catch (err) {
      console.error(`Error parsing feed ${feedUrl}:`, err);
    }
  }

  return newIdeas;
}
