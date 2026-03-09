import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generate } from "../ai/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOCIAL_PROMPT = readFileSync(
  resolve(__dirname, "../ai/prompts/social.md"),
  "utf-8"
);

export type Platform = "twitter" | "linkedin" | "instagram";

export interface SocialPost {
  text: string;
  hashtags: string[];
  platform: Platform;
}

export async function generateSocialPost(
  platform: Platform,
  topic: string
): Promise<SocialPost> {
  const prompt = `Create a ${platform} post about: ${topic}

Platform: ${platform}
Topic: ${topic}

Return only the JSON object.`;

  const response = await generate({
    system: SOCIAL_PROMPT,
    prompt,
    maxTokens: 1024,
  });

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI response did not contain valid JSON");
  }

  const post = JSON.parse(jsonMatch[0]) as SocialPost;
  post.platform = platform;
  return post;
}

export async function generateFromBlogPost(
  platform: Platform,
  blogTitle: string,
  blogContent: string
): Promise<SocialPost> {
  const prompt = `Create a ${platform} post that promotes this blog article.

Blog title: ${blogTitle}
Blog excerpt: ${blogContent.substring(0, 500)}

The post should entice readers to click through and read the full article on aiworkguide.com.
Return only the JSON object.`;

  const response = await generate({
    system: SOCIAL_PROMPT,
    prompt,
    maxTokens: 1024,
  });

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI response did not contain valid JSON");
  }

  const post = JSON.parse(jsonMatch[0]) as SocialPost;
  post.platform = platform;
  return post;
}
