# CarbonAI-Private v2.0

A private AI chatbot with custom authentication, persistent serverless SQLite, Backblaze B2 storage, intelligent AI routing, web search, voice features, memory, and themes.

## Production architecture

| Component | Technology |
|---|---|
| Hosting | Vercel / Next.js |
| Auth | Custom JWT + HTTP-only cookie |
| Database | Turso Cloud / libSQL |
| File storage | Backblaze B2 |
| AI routing | Gemini → Groq → OpenRouter with failover |
| Frontend | Next.js 14 + Tailwind CSS + TypeScript |

### Why Turso

CarbonAI originally used a local `better-sqlite3` file. That is not a safe persistence layer for Vercel serverless deployments because the local filesystem is not the application's durable database.

CarbonAI now uses the `libsql` Node driver, which keeps the existing SQLite-style SQL API while connecting to a remote Turso database when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are present. For local development without those variables, CarbonAI falls back to `data/carbonai.db`.

## Vercel setup

### 1. Connect Turso to Vercel

Open your Vercel project and go to **Marketplace → Turso Cloud → Add Integration**. Connect it to the CarbonAI project.

The integration provides these environment variables:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

Do not commit either value to GitHub.

### 2. Add your existing CarbonAI environment variables

Keep the existing AI, B2, SMTP, registration-access, and JWT variables you already use:

```text
JWT_SECRET=<long random secret>
ACCESS_KEY=<optional registration access key>

B2_KEY_ID=<your B2 key id>
B2_APPLICATION_KEY=<your B2 application key>
B2_BUCKET_ID=<your B2 bucket id>
B2_BUCKET_NAME=<your B2 bucket name>

GEMINI_API_KEY=<your Gemini key>
GROQ_API_KEY=<your Groq key>
OPENROUTER_API_KEY=<your OpenRouter key>

SMTP_HOST=<optional>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<optional>
SMTP_PASS=<optional>
SMTP_FROM=<optional>
```

### 3. Redeploy

After connecting Turso and adding the environment variables, trigger a fresh Vercel deployment. The first database request automatically creates the CarbonAI tables.

### 4. Verify the deployment

Open:

```text
https://YOUR-DOMAIN/api/health
```

A working deployment should report:

```json
{
  "status": "healthy",
  "database": "healthy"
}
```

If `database` is `unavailable`, check that the Turso integration is connected to the correct Vercel project and that the production environment contains `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

## Local development

You can continue developing without Turso:

```bash
npm install
npm run dev
```

When Turso variables are absent, CarbonAI uses `data/carbonai.db` locally. The local database is ignored by Git.

To test against the same cloud database locally, add the Turso variables to `.env.local`.

## Security notes

- Passwords use salted PBKDF2-SHA512 hashing.
- Auth tokens are stored in HTTP-only cookies.
- API keys stay server-side.
- Backblaze B2 is used as private object storage.
- Database access is server-side only.
- Account deletion removes database records and associated B2 files.

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
| `/api/health` | GET | Check AI provider and database health |

## Important migration note

The old local SQLite database files that were tracked in the repository have been removed. Existing Vercel `/tmp` database state is not durable and should not be treated as production data. Create/use the new Turso database as the production source of truth.

## License

MIT
