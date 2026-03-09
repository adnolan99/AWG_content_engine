# AWG Content Automation Engine

## Context
AI Work Guide needs consistent blog and social media content to drive organic traffic and establish authority. Manually creating and posting content is unsustainable. This engine is a **separate standalone project** (not part of the AWG website codebase) that automates content generation and distribution across blog and social channels.

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│           AWG Content Engine (Node.js)           │
├─────────────────────────────────────────────────┤
│  Scheduler (node-cron)                          │
│  ├─ News Monitor    → content ideas             │
│  ├─ Blog Generator  → DropInBlog API            │
│  └─ Social Generator → Buffer API → platforms   │
├─────────────────────────────────────────────────┤
│  AI Layer (swappable)                           │
│  ├─ Claude API (@anthropic-ai/sdk)              │
│  └─ OpenAI API (openai)                         │
├─────────────────────────────────────────────────┤
│  Review Queue (SQLite + simple web UI)          │
│  ├─ Pending posts list                          │
│  └─ Approve / Edit / Reject actions             │
├─────────────────────────────────────────────────┤
│  Config (YAML/JSON)                             │
│  ├─ Schedules per content type                  │
│  ├─ Auto-post vs review-queue per type          │
│  └─ AI model preferences                        │
└─────────────────────────────────────────────────┘
```

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Scheduler**: `node-cron` for recurring jobs
- **AI**: `@anthropic-ai/sdk` (Claude) + `openai` (OpenAI), configurable per content type
- **Database**: SQLite (via `better-sqlite3` or Drizzle) for review queue, content history, idea backlog
- **Blog publishing**: DropInBlog REST API (`https://api.dropinblog.com/v2/blog/{blog_id}/posts`)
- **Social publishing**: Buffer API (handles Twitter/X, LinkedIn, Instagram from one integration)
- **News monitoring**: Google News RSS, industry RSS feeds, keyword alerts
- **Web UI**: Simple Express + HTML dashboard for review queue (no framework needed)
- **Deployment**: DigitalOcean App Platform (worker component in AWG team)

## Core Modules

### 1. Content Idea Generator (`src/ideas/`)
- Monitor RSS feeds (Google News, industry blogs) for keywords: "AI for SMB", "small business automation", "AI tools", etc.
- Scrape trending topics from relevant subreddits/forums (read-only)
- Store ideas in SQLite `ideas` table with source, keywords, relevance score
- Schedule: every 6 hours

### 2. Blog Post Generator (`src/blog/`)
- Pick from idea backlog or use configured topic templates
- Generate full blog post via AI (title, body, meta description, categories, slug)
- AWG brand voice prompt template stored in `src/prompts/blog.md`
- Publish via DropInBlog API: `POST /v2/blog/{blog_id}/posts`
  - Fields: `title`, `content` (HTML), `status` ("draft" or "published"), `slug`, `categories`, `seo_title`, `seo_description`
  - Auth: Bearer token header
  - Rate limit: 60 req/min
- **Mode**: Review queue by default (posts created as drafts, appear in dashboard for approval)
- Schedule: configurable (e.g., 2 posts/week)

### 3. Social Post Generator (`src/social/`)
- Generate platform-specific content from blog posts, ideas, or standalone prompts
- Platform-aware formatting:
  - **Twitter/X**: ≤280 chars, hashtags, thread support
  - **LinkedIn**: Professional tone, longer form, hashtags
  - **Instagram**: Caption + suggested image prompt (manual image upload initially)
- Publish via Buffer API: `POST /api/v1/updates/create`
  - Auth: OAuth2 access token
  - Fields: `profile_ids[]`, `text`, `scheduled_at` (optional)
  - Buffer handles per-platform formatting and scheduling
- **Mode**: Configurable per platform (auto-post for Twitter, review queue for LinkedIn/Instagram)
- Schedule: configurable (e.g., daily Twitter, 3x/week LinkedIn, 2x/week Instagram)

### 4. Review Queue (`src/queue/`)
- SQLite tables: `queue` (id, type, platform, title, content, status, created_at, scheduled_for)
- Status: `pending` → `approved` / `rejected` / `edited`
- Simple Express web UI at `localhost:4000/queue`:
  - List pending items grouped by type (blog/social)
  - Preview content
  - Approve (publishes immediately or at scheduled time)
  - Edit inline then approve
  - Reject with optional note
- Email notification when new items enter queue (via Resend, reuse AWG domain)

### 5. Configuration (`config.yaml`)
```yaml
ai:
  default_model: claude
  claude:
    model: claude-sonnet-4-6
  openai:
    model: gpt-4o

blog:
  schedule: "0 9 * * 1,4"  # Mon & Thu at 9am
  mode: review_queue
  dropinblog_id: "<blog_id>"

social:
  twitter:
    schedule: "0 10 * * *"  # daily at 10am
    mode: auto_post
    buffer_profile_id: "<id>"
  linkedin:
    schedule: "0 11 * * 1,3,5"  # MWF at 11am
    mode: review_queue
    buffer_profile_id: "<id>"
  instagram:
    schedule: "0 12 * * 2,5"  # Tue & Fri at noon
    mode: review_queue
    buffer_profile_id: "<id>"

monitoring:
  schedule: "0 */6 * * *"  # every 6 hours
  keywords:
    - "AI small business"
    - "business automation"
    - "AI tools SMB"
  rss_feeds:
    - "https://news.google.com/rss/search?q=AI+small+business"
```

## Project Structure
```
awg-content-engine/
├── src/
│   ├── index.ts          # entry point, starts scheduler
│   ├── config.ts         # load & validate config.yaml
│   ├── ai/
│   │   ├── client.ts     # unified AI interface (Claude/OpenAI)
│   │   └── prompts/      # prompt templates (.md files)
│   ├── ideas/
│   │   ├── monitor.ts    # RSS/news monitoring
│   │   └── scorer.ts     # relevance scoring
│   ├── blog/
│   │   ├── generator.ts  # blog post generation
│   │   └── publisher.ts  # DropInBlog API client
│   ├── social/
│   │   ├── generator.ts  # social post generation
│   │   └── publisher.ts  # Buffer API client
│   ├── queue/
│   │   ├── db.ts         # SQLite schema & queries
│   │   ├── server.ts     # Express review UI
│   │   └── views/        # HTML templates
│   └── scheduler.ts      # node-cron job setup
├── config.yaml
├── package.json
├── tsconfig.json
└── .env                  # API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, BUFFER_TOKEN, DROPINBLOG_TOKEN, RESEND_API_KEY)
```

## API Keys & Accounts Needed
1. **DropInBlog**: Already have account — need API token from dashboard
2. **Buffer**: Sign up at buffer.com, connect Twitter/X + LinkedIn + Instagram profiles, get OAuth token
3. **Anthropic**: Already have key (reuse or create separate)
4. **OpenAI**: Create API key at platform.openai.com
5. **Resend**: Already configured for aiworkguide.com domain

## Implementation Order
1. **Scaffold project** — init Node.js + TypeScript, install deps, set up config loading
2. **AI layer** — unified client that wraps Claude + OpenAI, prompt template loading
3. **Blog generator + DropInBlog publisher** — generate and publish blog posts (draft mode)
4. **Review queue** — SQLite + Express UI for approving/rejecting content
5. **Social generator + Buffer publisher** — generate and publish social posts
6. **News monitor** — RSS parsing, keyword matching, idea storage
7. **Scheduler** — wire everything together with node-cron
8. **Deploy** — DigitalOcean App Platform worker in AWG team

## Verification
- Run locally with `npm run dev` — scheduler triggers on configured cron times
- Test blog generation: creates draft in DropInBlog dashboard
- Test social generation: creates scheduled post in Buffer dashboard
- Test review queue: visit `localhost:4000/queue`, approve a pending post, confirm it publishes
- Test news monitoring: check `ideas` table populates with relevant items
- Test auto-post mode: configure Twitter to auto-post, verify post appears on timeline
