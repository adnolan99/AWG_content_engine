import { loadConfig } from "../config.js";

interface DropInBlogPost {
  title: string;
  content: string;
  slug?: string;
  status?: "draft" | "published";
  keyword?: string;
  seo_title?: string;
  seo_description?: string;
  categories?: string[];
  faqs?: { question: string; answer: string }[];
}

interface DropInBlogResponse {
  success: boolean;
  data?: {
    post: {
      id: number;
      slug: string;
      url: string;
      shareUrl: string;
    };
  };
  message?: string;
}

export async function publishToBlog(
  post: DropInBlogPost
): Promise<{ id: string; slug: string; url: string }> {
  const config = loadConfig();
  const blogId =
    config.blog.dropinblog_id || process.env.DROPINBLOG_BLOG_ID || "";
  const token = process.env.DROPINBLOG_TOKEN || "";

  if (!blogId || !token) {
    throw new Error(
      "DropInBlog credentials not configured. Set DROPINBLOG_BLOG_ID and DROPINBLOG_TOKEN in .env"
    );
  }

  const response = await fetch(
    `https://api.dropinblog.com/v2/blog/${blogId}/posts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: post.title,
        content: post.content,
        slug: post.slug,
        status: post.status ?? "draft",
        keyword: post.keyword,
        seo_title: post.seo_title,
        seo_description: post.seo_description,
        categories: post.categories,
        faqs: post.faqs,
        enable_toc: true,
        author_id: parseInt(process.env.DROPINBLOG_AUTHOR_ID || "74402", 10),
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DropInBlog API error (${response.status}): ${text}`);
  }

  const result = (await response.json()) as DropInBlogResponse;
  if (!result.success) {
    throw new Error(`DropInBlog error: ${result.message}`);
  }

  return {
    id: String(result.data?.post?.id ?? ""),
    slug: result.data?.post?.slug ?? post.slug ?? "",
    url: result.data?.post?.url ?? "",
  };
}
