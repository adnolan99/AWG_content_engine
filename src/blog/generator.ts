import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generate } from "../ai/client.js";
import { getNewIdeas, markIdeaUsed } from "../queue/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_PROMPT = readFileSync(
  resolve(__dirname, "../ai/prompts/blog.md"),
  "utf-8"
);

export interface BlogPost {
  title: string;
  slug: string;
  seo_title: string;
  seo_description: string;
  categories: string[];
  content: string;
}

export async function generateBlogPost(topic?: string): Promise<BlogPost> {
  let prompt: string;
  let ideaId: number | undefined;

  if (topic) {
    prompt = `Write a blog post about: ${topic}`;
  } else {
    // Pick from idea backlog
    const ideas = getNewIdeas(1);
    if (ideas.length > 0) {
      const idea = ideas[0];
      ideaId = idea.id;
      prompt = `Write a blog post inspired by this topic: "${idea.title}"${idea.url ? ` (source: ${idea.url})` : ""}`;
      markIdeaUsed(idea.id);
    } else {
      prompt = `Write a blog post about a practical AI or automation tip for small business owners. Choose a specific, actionable topic.`;
    }
  }

  const response = await generate({
    system: BLOG_PROMPT,
    prompt,
    maxTokens: 4096,
  });

  // Parse the JSON response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI response did not contain valid JSON");
  }

  const post = JSON.parse(jsonMatch[0]) as BlogPost;
  return post;
}
