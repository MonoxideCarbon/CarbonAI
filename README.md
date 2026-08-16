# CarbonAI-Private

A private AI chatbot with custom authentication, persistent Supabase storage, intelligent AI routing, web search, voice features, memory, attachments, themes, and Vercel deployment support.

## Production architecture

| Component | Technology |
|---|---|
| Hosting | Vercel / Next.js |
| Auth/session | CarbonAI JWT + HTTP-only cookie |
| Persistent application data | Supabase Postgres |
| File storage | Supabase Storage (private bucket) |
| AI routing | Gemini → Groq → OpenRouter with failover |
| Frontend | Next.js 14 + Tailwind CSS + TypeScript |

CarbonAI no longer uses Backblaze B2, Turso, SQLite, or another persistence provider. Users, chats, messages, memories, attachment metadata, password-reset state, and verification state are stored in Supabase Postgres. Uploaded files are stored in a private Supabase Storage bucket.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql).
3. In the Supabase project settings, copy the Project URL and server-side service role key.
4. Create the following Vercel Production environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=<your Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<your Supabase service role key>
SUPABASE_STORAGE_BUCKET=carbonai-files

JWT_SECRET=<long random secret>
ACCESS_KEY=<optional registration access key>

GEMINI_API_KEY=<optional Gemini key>
GROQ_API_KEY=<optional Groq key>
OPENROUTER_API_KEY=<optional OpenRouter key>

SMTP_HOST=<optional; used only for your existing SMTP setup>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<optional>
SMTP_PASS=<optional>
SMTP_FROM=<optional>
```

**Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser and never commit it to GitHub.** Supabase documents service-role keys as server-only credentials. urlSupabase JavaScript documentationhttps://supabase.com/docs/reference/javascript/initializing

## Database and Storage model

```text
public.users
public.chats
public.messages
public.memories
public.attachments

Supabase Storage bucket:
  carbonai-files/
    <user-id>/<chat-id>/<attachment-id>-<filename>
```

The bucket is private. CarbonAI accesses it only from server-side Route Handlers using the service-role key. The browser receives data through CarbonAI's authenticated `/api/upload` route.

## Deployment

Vercel builds the project with:

```bash
npm run build
```

After deployment, verify:

```text
https://YOUR-DOMAIN/api/health
```

A healthy deployment reports `storage: healthy` when Supabase Postgres and the private Storage bucket are reachable and at least one AI provider is healthy.

## Upload limit on Vercel

The `/api/upload` route accepts files up to **4 MB**. This keeps uploads below the serverless request-body limit and avoids opaque runtime failures.

## Security

- Passwords use salted PBKDF2-SHA512 hashing.
- Auth tokens are stored in HTTP-only cookies.
- Middleware verifies JWT signatures before protecting routes.
- Supabase service-role credentials stay server-side.
- Supabase tables use Row Level Security and are revoked from `anon` and `authenticated`; CarbonAI accesses them server-side.
- Supabase Storage is private and application access is ownership-checked before download.
- Account deletion removes database records and associated storage objects through Postgres foreign keys and server-side Storage deletion.

## API routes

| Route | Method | Description |
|---|---|---|
| `/api/auth/signup` | POST | Create account |
| `/api/auth/login` | POST | Login and set auth cookie |
| `/api/auth/logout` | POST | Clear auth cookie |
| `/api/auth/me` | GET | Validate current session |
| `/api/auth/verify` | GET | Verify email token |
| `/api/auth/reset-request` | POST | Start password reset |
| `/api/auth/reset-confirm` | POST | Complete password reset |
| `/api/auth/delete` | DELETE | Delete account and stored files |
| `/api/chat` | POST | Stream AI response |
| `/api/chat/list` | GET | List chats |
| `/api/chat/create` | POST | Create chat |
| `/api/chat/delete` | DELETE | Delete chat |
| `/api/upload` | POST/GET | Upload/download files |
| `/api/search` | POST | Web search |
| `/api/health` | GET | Check AI providers and Supabase |

## Migration note

The old Backblaze B2 implementation has been removed. Existing B2 data is **not automatically imported** by this code change. Create the Supabase schema before deployment and treat Supabase as the new production source of truth.
