import "dotenv/config";
import { loadConfig } from "./config.js";
import { getDb, enqueue } from "./queue/db.js";
import { generateBlogPost } from "./blog/generator.js";
import { publishToBlog } from "./blog/publisher.js";
import { recordPublished } from "./queue/db.js";

const args = process.argv.slice(2);
const topic = args.join(" ") || undefined;
const directPublish = args.includes("--publish");

async function main() {
  loadConfig();
  getDb();

  console.log(
    topic
      ? `Generating blog post about: "${topic}"`
      : "Generating blog post from idea backlog (or random topic)..."
  );

  const post = await generateBlogPost(topic);

  console.log(`\nGenerated: "${post.title}"`);
  console.log(`Keyword: ${post.keyword}`);
  console.log(`Slug: ${post.slug}`);
  console.log(`SEO Title: ${post.seo_title}`);
  console.log(`SEO Description: ${post.seo_description}`);
  console.log(`Categories: ${post.categories.join(", ")}`);
  const wordCount = post.content.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
  console.log(`Word count: ~${wordCount}`);
  console.log(`Content length: ${post.content.length} chars`);
  if (post.faqs?.length) {
    console.log(`FAQs: ${post.faqs.length}`);
  }
  if (post.suggested_image) {
    console.log(`Suggested image: ${post.suggested_image.description}`);
    console.log(`  Filename: ${post.suggested_image.filename}`);
    console.log(`  Alt text: ${post.suggested_image.alt_text}`);
  }

  if (directPublish) {
    console.log("\nPublishing directly to DropInBlog...");
    const result = await publishToBlog({
      title: post.title,
      content: post.content,
      slug: post.slug,
      status: "draft",
      keyword: post.keyword,
      seo_title: post.seo_title,
      seo_description: post.seo_description,
      categories: post.categories,
      faqs: post.faqs,
    });
    recordPublished({
      type: "blog",
      title: post.title,
      external_id: result.id,
      external_url: result.url,
    });
    console.log(`Published! URL: ${result.url}`);
  } else {
    const id = enqueue({
      type: "blog",
      title: post.title,
      content: post.content,
      metadata: JSON.stringify({
        keyword: post.keyword,
        slug: post.slug,
        seo_title: post.seo_title,
        seo_description: post.seo_description,
        categories: post.categories,
        faqs: post.faqs,
        suggested_image: post.suggested_image,
      }),
    });
    console.log(`\nQueued for review (ID: ${id})`);
    console.log(
      `Start the review queue with: npm run dev`
    );
    console.log(`Then visit: http://localhost:4000/queue`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
