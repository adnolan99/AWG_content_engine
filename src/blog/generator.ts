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
  keyword: string;
  title: string;
  slug: string;
  seo_title: string;
  seo_description: string;
  categories: string[];
  content: string;
  faqs: { question: string; answer: string }[];
  suggested_image?: {
    description: string;
    filename: string;
    alt_text: string;
    search_term?: string;
  };
}

export async function generateBlogPost(topic?: string): Promise<BlogPost> {
  let topicDescription: string;
  let ideaId: number | undefined;

  if (topic) {
    topicDescription = topic;
  } else {
    const ideas = getNewIdeas(1);
    if (ideas.length > 0) {
      const idea = ideas[0];
      ideaId = idea.id;
      topicDescription = `"${idea.title}"${idea.url ? ` (source: ${idea.url})` : ""}`;
      markIdeaUsed(idea.id);
    } else {
      topicDescription = "a practical AI or automation tip for small business owners — choose a specific, actionable topic";
    }
  }

  // Step 1: Generate the full blog content as HTML
  const contentPrompt = `Write a detailed blog post about: ${topicDescription}

Requirements:
- Write in HTML using h2, h3, p, ul/li, strong, em tags
- Write AT LEAST 1,200 words. Target 1,200-1,500 words. Do NOT write fewer than 1,200 words.
- Include at least 5-6 H2 sections, each with 2-3 detailed paragraphs
- Include specific real-world examples and actionable advice in every section
- Do NOT include any <img> tags — images are handled separately
- Include 2-3 internal links to aiworkguide.com pages (use /assessment, /problems, /solutions, /tools, /tiers paths)
- The focus keyword MUST appear in the first paragraph, in at least one H2, and 6-8 times total across the content (do NOT exceed 10 uses)
- Include at least 2 bullet/numbered lists and at least one HTML table for structured, AI-friendly content
- End with a clear call-to-action
- Write the full HTML content ONLY — no JSON, no metadata, just the blog post HTML`;

  const contentResponse = await generate({
    system: BLOG_PROMPT,
    prompt: contentPrompt,
    maxTokens: 16384,
  });

  // Clean up: strip any markdown code fences if present
  let htmlContent = contentResponse.trim();
  if (htmlContent.startsWith("```")) {
    htmlContent = htmlContent.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");
  }

  // Step 2: Generate SEO metadata for the content
  const metadataPrompt = `Given this blog post content, generate SEO metadata as a JSON object.

Blog content (first 500 chars): ${htmlContent.substring(0, 500)}...

Full topic: ${topicDescription}

Return ONLY a JSON object with these fields:
{
  "keyword": "2-4 word SEO focus keyword that appears in the content",
  "title": "Compelling headline, 50-60 chars, keyword near the beginning",
  "slug": "url-friendly-slug-with-keyword",
  "seo_title": "SEO title ≤60 chars with keyword near beginning",
  "seo_description": "Meta description 150-160 chars with keyword included naturally",
  "categories": ["Category1", "Category2"],
  "faqs": [
    {"question": "Practical question about the topic?", "answer": "Helpful answer."},
    {"question": "Another question?", "answer": "Another answer."}
  ],
  "suggested_image": {
    "description": "Description of a relevant featured image",
    "filename": "keyword-in-filename.jpg",
    "alt_text": "Alt text containing the keyword",
    "search_term": "2-3 word Unsplash search query"
  }
}

Include 3-5 FAQs that a small business owner would realistically ask about this topic. Include the keyword naturally in at least one question and one answer.`;

  const metadataResponse = await generate({
    system: "You are an SEO specialist. Return only valid JSON, no markdown fences or extra text.",
    prompt: metadataPrompt,
    maxTokens: 2048,
  });

  // Parse metadata JSON
  const firstBrace = metadataResponse.indexOf("{");
  const lastBrace = metadataResponse.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Metadata response did not contain valid JSON");
  }
  const metadata = JSON.parse(metadataResponse.substring(firstBrace, lastBrace + 1));

  // Step 3: Search Unsplash for a relevant image and inject into content
  const imageData = metadata.suggested_image;
  if (imageData) {
    const keyword = metadata.keyword || "";
    const keywordSlug = keyword.toLowerCase().replace(/\s+/g, "-");
    const altText = imageData.alt_text || `${keyword} for small businesses`;
    const searchTerm = imageData.search_term || keyword;

    let imageUrl = "";
    let photographerName = "";
    let photographerUrl = "";

    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      try {
        const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchTerm)}&per_page=1&orientation=landscape`;
        const res = await fetch(searchUrl, {
          headers: { Authorization: `Client-ID ${unsplashKey}` },
        });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.results?.length > 0) {
            const photo = data.results[0];
            imageUrl = photo.urls?.regular || "";
            photographerName = photo.user?.name || "";
            photographerUrl = photo.user?.links?.html || "";
          }
        }
      } catch (err) {
        console.error("Unsplash search failed:", err);
      }
    }

    if (!imageUrl) {
      // Fallback to picsum if Unsplash fails
      imageUrl = `https://picsum.photos/seed/${keywordSlug.substring(0, 20)}/800/450`;
    }

    const imgTag = `<img src="${imageUrl}" alt="${altText}" title="${keywordSlug}" width="800" height="450" />`;

    // Insert image after the first closing </p> tag
    const firstPClose = htmlContent.indexOf("</p>");
    if (firstPClose !== -1) {
      htmlContent = htmlContent.substring(0, firstPClose + 4) + "\n" + imgTag + "\n" + htmlContent.substring(firstPClose + 4);
    } else {
      htmlContent = imgTag + "\n" + htmlContent;
    }

    // Add photo credit at the very bottom of the article
    if (photographerName) {
      htmlContent += `\n<p style="font-size:0.65rem;color:#999;">Photo Credits: <a href="${photographerUrl}?utm_source=awg_content_engine&utm_medium=referral" target="_blank" rel="noopener">${photographerName}</a> on <a href="https://unsplash.com/?utm_source=awg_content_engine&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a></p>`;
    }
  }

  return {
    keyword: metadata.keyword ?? "",
    title: metadata.title ?? "",
    slug: metadata.slug ?? "",
    seo_title: metadata.seo_title ?? "",
    seo_description: metadata.seo_description ?? "",
    categories: metadata.categories ?? [],
    content: htmlContent,
    faqs: metadata.faqs ?? [],
    suggested_image: metadata.suggested_image,
  };
}
