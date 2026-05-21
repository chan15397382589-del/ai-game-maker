# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick start

```bash
cd C:\Users\DELL\WorkBuddy\2026-05-13-task-5
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
```

Requires `.env.local` with: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`. See `.env.local.example` for template. DeepSeek API may need proxy at `127.0.0.1:7897`.

## Architecture

**AI Game Classroom** — elementary school students chat with an AI teacher ("小智老师") to create HTML5 games, guided by structured Q&A (one question + numbered options per turn). The AI generates complete HTML files rendered in an iframe. Teachers manage students, audit conversations, and review published projects.

### Tech stack

Next.js 16 (App Router) + React 18 + TypeScript 5 · Tailwind CSS 3.3 · Supabase (Auth + PostgreSQL + RLS) · DeepSeek Chat API via OpenAI SDK compatibility layer

### Dual-role system

- **Student portal** (`/student`): Left panel = AI chat with SSE streaming, right panel = code/game preview with iframe. Students pick game type/features via numbered options, AI generates HTML. Max 2 conversation sessions per student, each storing accumulated game HTML.
- **Admin portal** (`/admin`): Three tabs — student management (grade/class tree nav + batch import via xlsx), conversation audit (replay chat bubbles per student session), project review (table + iframe preview modal).
- **Root page** (`/`): Auth check → redirects to `/student` or `/admin` based on role.

### Auth flow

All client pages are `"use client"` with Supabase client-side auth. Login page (`/login`) has two modes — student (email = `{student_id}@ai-game.student`) and admin (real email). Role is stored in `users.role` column, not in Supabase auth metadata. Auth check uses `supabase.auth.getUser()` + users table lookup. `SupabaseProvider` wraps the entire app and listens for auth state changes.

### API route patterns

- **/api/chat** — Core SSE streaming: validates token → extracts real userId from token (never trusts client) → saves user message to DB → streams DeepSeek response → saves full AI reply on completion. Current game code is injected into system prompt (not messages array) to avoid DeepSeek's strict user/assistant alternation requirement.
- **/api/student/sessions** — Full CRUD for conversation documents (max 2 per student).
- **/api/student/messages** — Fetches messages by session_id (enforced, won't return unfiltered data).
- **/api/projects** — Student-owned game publishing (POST/GET).
- **/api/admin/*** — All admin routes require `getVerifiedAdmin()` from `src/lib/admin-auth.ts`, which validates token, checks `users.role === "admin"`, and auto-creates admin record on first access. No auto-upgrade of non-admin users (security fix).

All backend DB access uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Client-side Supabase uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Database tables

`users` (id, name, student_id, role, gender, grade, class_num) · `messages` (user_id, role, content, session_id, created_at) · `conversations` (user_id, title, html_code, created_at, updated_at) · `projects` (user_id, game_title, html_code, is_published, created_at)

### Key source files

| File | Purpose |
|------|---------|
| `src/lib/deepseek.ts` | DeepSeek client (OpenAI SDK), system prompt (~80 lines defining AI teacher persona and strict output rules), `saveMessage()` using service role |
| `src/lib/admin-auth.ts` | `getVerifiedAdmin(token)` — validates token + role, returns `{userId, userName}` or `NextResponse` error |
| `src/components/SupabaseProvider.tsx` | Singleton `supabase` client + auth listener + stale session cleanup |
| `src/app/api/chat/route.ts` | SSE chat pipeline: auth → save user msg → stream → save assistant msg |
| `src/app/student/page.tsx` | ~1090 lines — chat UI, code extraction from AI responses, iframe preview, conversation CRUD, game publish/download |
| `src/app/admin/page.tsx` | ~1156 lines — three tabbed sub-components: StudentsManagement, MessagesAudit, ProjectsReview |

### Critical constraints (do not regress)

1. **DeepSeek messages alternation**: Messages array must end with `user`. Current game code goes in system prompt, never in messages.
2. **rawMessagesRef sync**: Frontend displays extracted text-only messages. `rawMessagesRef.current` holds full content with code blocks. Always update both when modifying messages.
3. **Sending lock with useRef**: `sendingRef.current` for concurrency guard — never `useState` for this.
4. **Message key strategy**: Use `key={`msg-${i}-${role}-${content.length}`}` — never bare index.
5. **userId from token**: API routes must extract userId from `Authorization` header token, never trust client-supplied userId.
6. **Supabase client singleton**: Module-level `createClient()` — don't create new instances in render.
7. **HTML code extraction**: Match ` ```html ... ``` ` blocks, handle unclosed blocks during streaming, filter `@image#` placeholders.
8. **No admin auto-upgrade**: `getVerifiedAdmin()` rejects non-admin users with 403, only auto-creates on first access when no record exists.

See `CLAUDE-CODE-MANUAL.md` for detailed API specs, database schema, and page-level documentation.
