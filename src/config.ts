import { readFileSync } from "fs";
import { parse } from "yaml";
import { resolve } from "path";

export interface Config {
  ai: {
    default_model: "claude" | "openai";
    claude: { model: string };
    openai: { model: string };
  };
  blog: {
    schedule: string;
    mode: "auto_post" | "review_queue";
    dropinblog_id: string;
  };
  social: {
    twitter: SocialPlatformConfig;
    linkedin: SocialPlatformConfig;
    instagram: SocialPlatformConfig;
  };
  monitoring: {
    schedule: string;
    keywords: string[];
    rss_feeds: string[];
  };
}

export interface SocialPlatformConfig {
  schedule: string;
  mode: "auto_post" | "review_queue";
  buffer_profile_id: string;
}

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  const configPath = resolve(process.cwd(), "config.yaml");
  const raw = readFileSync(configPath, "utf-8");
  _config = parse(raw) as Config;

  // Override dropinblog_id from env if set
  if (process.env.DROPINBLOG_BLOG_ID) {
    _config.blog.dropinblog_id = process.env.DROPINBLOG_BLOG_ID;
  }

  return _config;
}
