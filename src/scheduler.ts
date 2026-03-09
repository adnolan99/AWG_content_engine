import cron from "node-cron";
import { loadConfig } from "./config.js";
import { generateBlogPost } from "./blog/generator.js";
import { publishToBlog } from "./blog/publisher.js";
import { generateSocialPost, type Platform } from "./social/generator.js";
import { publishToBuffer } from "./social/publisher.js";
import { monitorFeeds } from "./ideas/monitor.js";
import { enqueue, getNewIdeas, recordPublished } from "./queue/db.js";

function log(message: string) {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${time} [engine] ${message}`);
}

export function startScheduler(): void {
  const config = loadConfig();

  // --- News monitoring ---
  cron.schedule(config.monitoring.schedule, async () => {
    log("Running news monitor...");
    try {
      const count = await monitorFeeds();
      log(`News monitor found ${count} new ideas`);
    } catch (err) {
      console.error("News monitor error:", err);
    }
  });

  // --- Blog generation ---
  cron.schedule(config.blog.schedule, async () => {
    log("Generating blog post...");
    try {
      const post = await generateBlogPost();
      log(`Generated blog: "${post.title}"`);

      if (config.blog.mode === "auto_post") {
        const result = await publishToBlog({
          title: post.title,
          content: post.content,
          slug: post.slug,
          status: "published",
          seo_title: post.seo_title,
          seo_description: post.seo_description,
          categories: post.categories,
        });
        recordPublished({
          type: "blog",
          title: post.title,
          external_id: result.id,
          external_url: result.url,
        });
        log(`Published blog: ${result.url}`);
      } else {
        enqueue({
          type: "blog",
          title: post.title,
          content: post.content,
          metadata: JSON.stringify({
            slug: post.slug,
            seo_title: post.seo_title,
            seo_description: post.seo_description,
            categories: post.categories,
          }),
        });
        log(`Blog queued for review: "${post.title}"`);
      }
    } catch (err) {
      console.error("Blog generation error:", err);
    }
  });

  // --- Social media generation ---
  const platforms: Platform[] = ["twitter", "linkedin", "instagram"];

  for (const platform of platforms) {
    const platformConfig = config.social[platform];
    if (!platformConfig?.schedule) continue;

    cron.schedule(platformConfig.schedule, async () => {
      log(`Generating ${platform} post...`);
      try {
        // Pick a topic from ideas or generate standalone
        const ideas = getNewIdeas(1);
        const topic = ideas.length > 0
          ? ideas[0].title
          : "AI automation tips for small businesses";

        const post = await generateSocialPost(platform, topic);
        log(`Generated ${platform} post: "${post.text.substring(0, 50)}..."`);

        if (platformConfig.mode === "auto_post") {
          const result = await publishToBuffer(post);
          recordPublished({
            type: "social",
            platform,
            title: post.text.substring(0, 100),
            external_id: result.id,
          });
          log(`Published to ${platform} via Buffer`);
        } else {
          enqueue({
            type: "social",
            platform,
            title: `${platform}: ${post.text.substring(0, 80)}`,
            content: post.text,
            metadata: JSON.stringify({ hashtags: post.hashtags }),
          });
          log(`${platform} post queued for review`);
        }
      } catch (err) {
        console.error(`${platform} generation error:`, err);
      }
    });
  }

  log("Scheduler started. Active schedules:");
  log(`  News monitor: ${config.monitoring.schedule}`);
  log(`  Blog: ${config.blog.schedule} (${config.blog.mode})`);
  for (const platform of platforms) {
    const pc = config.social[platform];
    if (pc?.schedule) {
      log(`  ${platform}: ${pc.schedule} (${pc.mode})`);
    }
  }
}
