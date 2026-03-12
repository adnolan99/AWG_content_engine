import express from "express";
import {
  getPending,
  getQueueItem,
  approveItem,
  rejectItem,
  updateItemContent,
  recordPublished,
} from "./db.js";
import { publishToBlog } from "../blog/publisher.js";
import { publishToBuffer } from "../social/publisher.js";
import type { SocialPost, Platform } from "../social/generator.js";

export function createQueueServer(): express.Express {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // List pending items
  app.get("/queue", (_req, res) => {
    const items = getPending();
    const blogItems = items.filter((i) => i.type === "blog");
    const socialItems = items.filter((i) => i.type === "social");

    res.send(renderPage("Review Queue", `
      <h2>Blog Posts (${blogItems.length})</h2>
      ${blogItems.length === 0 ? "<p>No pending blog posts.</p>" : ""}
      ${blogItems.map((item) => renderCard(item)).join("")}

      <h2>Social Posts (${socialItems.length})</h2>
      ${socialItems.length === 0 ? "<p>No pending social posts.</p>" : ""}
      ${socialItems.map((item) => renderCard(item)).join("")}
    `));
  });

  // View single item
  app.get("/queue/:id", (req, res) => {
    const item = getQueueItem(Number(req.params.id));
    if (!item) return res.status(404).send("Not found");

    res.send(renderPage(item.title, `
      <div class="card">
        <div class="meta">
          <span class="badge ${item.type}">${item.type}</span>
          ${item.platform ? `<span class="badge">${item.platform}</span>` : ""}
          <span>${item.created_at}</span>
        </div>
        <h2>${item.title}</h2>
        <div class="content-preview">${item.type === "blog" ? item.content : `<pre>${escapeHtml(item.content)}</pre>`}</div>

        <form method="POST" action="/queue/${item.id}/edit" style="margin-bottom: 1rem;">
          <textarea name="content" rows="10" style="width: 100%; font-family: inherit;">${escapeHtml(item.content)}</textarea>
          <button type="submit" class="btn">Save Edit</button>
        </form>

        <div class="actions">
          <form method="POST" action="/queue/${item.id}/approve" style="display:inline;">
            <button type="submit" class="btn btn-approve">Approve & Publish</button>
          </form>
          <form method="POST" action="/queue/${item.id}/reject" style="display:inline;">
            <input type="text" name="note" placeholder="Rejection note (optional)" />
            <button type="submit" class="btn btn-reject">Reject</button>
          </form>
        </div>
      </div>
      <a href="/queue">&larr; Back to queue</a>
    `));
  });

  // Edit content
  app.post("/queue/:id/edit", (req, res) => {
    const id = Number(req.params.id);
    updateItemContent(id, req.body.content);
    res.redirect(`/queue/${id}`);
  });

  // Approve & publish
  app.post("/queue/:id/approve", async (req, res) => {
    const id = Number(req.params.id);
    const item = getQueueItem(id);
    if (!item) return res.status(404).send("Not found");

    try {
      if (item.type === "blog") {
        const metadata = item.metadata ? JSON.parse(item.metadata) : {};
        const result = await publishToBlog({
          title: item.title,
          content: item.content,
          slug: metadata.slug,
          status: "draft",
          keyword: metadata.keyword,
          seo_title: metadata.seo_title,
          seo_description: metadata.seo_description,
          categories: metadata.categories,
          faqs: metadata.faqs,
        });
        recordPublished({
          queue_id: id,
          type: "blog",
          title: item.title,
          external_id: result.id,
          external_url: result.url,
        });
      } else if (item.type === "social" && item.platform) {
        const metadata = item.metadata ? JSON.parse(item.metadata) : {};
        const socialPost: SocialPost = {
          text: item.content,
          hashtags: metadata.hashtags ?? [],
          platform: item.platform as Platform,
        };
        const result = await publishToBuffer(socialPost);
        recordPublished({
          queue_id: id,
          type: "social",
          platform: item.platform,
          title: item.title,
          external_id: result.id,
        });
      }

      approveItem(id);
      res.redirect("/queue");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).send(renderPage("Error", `
        <p>Failed to publish: ${escapeHtml(message)}</p>
        <a href="/queue/${id}">&larr; Back</a>
      `));
    }
  });

  // Reject
  app.post("/queue/:id/reject", (req, res) => {
    const id = Number(req.params.id);
    rejectItem(id, req.body.note);
    res.redirect("/queue");
  });

  return app;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCard(item: { id: number; type: string; platform: string | null; title: string; created_at: string }): string {
  return `
    <div class="card">
      <div class="meta">
        <span class="badge ${item.type}">${item.type}</span>
        ${item.platform ? `<span class="badge">${item.platform}</span>` : ""}
        <span>${item.created_at}</span>
      </div>
      <h3><a href="/queue/${item.id}">${escapeHtml(item.title)}</a></h3>
      <div class="card-actions">
        <form method="POST" action="/queue/${item.id}/reject" style="display:inline;">
          <button type="submit" class="btn btn-reject btn-sm">Reject</button>
        </form>
      </div>
    </div>
  `;
}

function renderPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - AWG Content Engine</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 2rem; max-width: 900px; margin: 0 auto; }
    h1 { margin-bottom: 1.5rem; }
    h2 { margin: 1.5rem 0 0.75rem; }
    .card { background: white; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h3 a { color: #1a1a1a; text-decoration: none; }
    .card h3 a:hover { color: #2563eb; }
    .card-actions { margin-top: 0.5rem; }
    .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.75rem; }
    .meta { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; font-size: 0.85rem; color: #666; }
    .badge { background: #e5e7eb; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge.blog { background: #dbeafe; color: #1d4ed8; }
    .badge.social { background: #dcfce7; color: #16a34a; }
    .content-preview { margin: 1rem 0; padding: 1rem; background: #f9fafb; border-radius: 4px; max-height: 400px; overflow-y: auto; }
    .content-preview pre { white-space: pre-wrap; word-break: break-word; }
    textarea { padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; }
    .actions { display: flex; gap: 0.5rem; align-items: center; margin-top: 1rem; }
    .actions input[type="text"] { padding: 0.4rem 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; }
    .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
    .btn-approve { background: #16a34a; color: white; }
    .btn-approve:hover { background: #15803d; }
    .btn-reject { background: #dc2626; color: white; }
    .btn-reject:hover { background: #b91c1c; }
    .btn { background: #2563eb; color: white; }
    .btn:hover { background: #1d4ed8; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>AWG Content Engine</h1>
  ${body}
</body>
</html>`;
}
