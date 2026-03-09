import Database from "better-sqlite3";
import { resolve } from "path";

const DB_PATH = resolve(process.cwd(), "content-engine.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      source TEXT,
      url TEXT,
      keywords TEXT,
      relevance_score REAL DEFAULT 0,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      platform TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      status TEXT DEFAULT 'pending',
      rejection_note TEXT,
      idea_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      scheduled_for TEXT,
      published_at TEXT,
      FOREIGN KEY (idea_id) REFERENCES ideas(id)
    );

    CREATE TABLE IF NOT EXISTS published (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER,
      type TEXT NOT NULL,
      platform TEXT,
      title TEXT NOT NULL,
      external_id TEXT,
      external_url TEXT,
      published_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (queue_id) REFERENCES queue(id)
    );
  `);

  return _db;
}

// --- Ideas ---

export interface Idea {
  id: number;
  title: string;
  source: string | null;
  url: string | null;
  keywords: string | null;
  relevance_score: number;
  status: string;
  created_at: string;
}

export function insertIdea(idea: {
  title: string;
  source?: string;
  url?: string;
  keywords?: string;
  relevance_score?: number;
}): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO ideas (title, source, url, keywords, relevance_score)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    idea.title,
    idea.source ?? null,
    idea.url ?? null,
    idea.keywords ?? null,
    idea.relevance_score ?? 0
  );
  return Number(result.lastInsertRowid);
}

export function getNewIdeas(limit = 10): Idea[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM ideas WHERE status = 'new' ORDER BY relevance_score DESC LIMIT ?`
    )
    .all(limit) as Idea[];
}

export function markIdeaUsed(id: number): void {
  const db = getDb();
  db.prepare(`UPDATE ideas SET status = 'used' WHERE id = ?`).run(id);
}

// --- Queue ---

export interface QueueItem {
  id: number;
  type: string;
  platform: string | null;
  title: string;
  content: string;
  metadata: string | null;
  status: string;
  rejection_note: string | null;
  idea_id: number | null;
  created_at: string;
  scheduled_for: string | null;
  published_at: string | null;
}

export function enqueue(item: {
  type: string;
  platform?: string;
  title: string;
  content: string;
  metadata?: string;
  idea_id?: number;
  scheduled_for?: string;
}): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO queue (type, platform, title, content, metadata, idea_id, scheduled_for)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    item.type,
    item.platform ?? null,
    item.title,
    item.content,
    item.metadata ?? null,
    item.idea_id ?? null,
    item.scheduled_for ?? null
  );
  return Number(result.lastInsertRowid);
}

export function getPending(): QueueItem[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM queue WHERE status = 'pending' ORDER BY created_at DESC`)
    .all() as QueueItem[];
}

export function getQueueItem(id: number): QueueItem | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM queue WHERE id = ?`).get(id) as
    | QueueItem
    | undefined;
}

export function approveItem(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE queue SET status = 'approved', published_at = datetime('now') WHERE id = ?`
  ).run(id);
}

export function rejectItem(id: number, note?: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE queue SET status = 'rejected', rejection_note = ? WHERE id = ?`
  ).run(note ?? null, id);
}

export function updateItemContent(id: number, content: string): void {
  const db = getDb();
  db.prepare(`UPDATE queue SET content = ? WHERE id = ?`).run(content, id);
}

// --- Published ---

export function recordPublished(item: {
  queue_id?: number;
  type: string;
  platform?: string;
  title: string;
  external_id?: string;
  external_url?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO published (queue_id, type, platform, title, external_id, external_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    item.queue_id ?? null,
    item.type,
    item.platform ?? null,
    item.title,
    item.external_id ?? null,
    item.external_url ?? null
  );
}
