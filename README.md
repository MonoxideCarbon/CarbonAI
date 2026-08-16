# CarbonAI-Private v2.0

A private AI chatbot with custom authentication, persistent serverless storage on Backblaze B2, intelligent AI routing, web search, voice features, memory, and themes.

## Production architecture

| Component | Technology |
|---|---|
| Hosting | Vercel / Next.js |
| Persistence | Backblaze B2 JSON objects |
| Auth | Custom JWT + HTTP-only cookie |
| File storage | Backblaze B2 |
| AI routing | Gemini → Groq → OpenRouter with failover |
| Frontend | Next.js 14 + Tailwind CSS + TypeScript |

CarbonAI intentionally uses **no separate database service**. User records, chats, messages, memories, and attachment metadata are stored as private JSON objects in Backblaze B2. Uploaded files are also stored in the same private B2 bucket.

## Vercel setup

The application requires only the existing server-side credentials below. There are no Turso, Neon, Supabase database, Firebase, or other database-service variables.

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

Do not commit secrets to GitHub.

## Deploy

Connect the GitHub repository to Vercel and deploy the `main` branch.

After deployment, open:

```text
https://YOUR-DOMAIN/api/health
```

A working deployment should report `status: healthy` and `storage: healthy` when at least one AI provider is healthy and B2 is reachable.

## Data layout

CarbonAI stores data under a private `carbonai/v1/` prefix in the B2 bucket:

```text
carbonai/v1/
├── users/<user-id>.json
├── email-index/<sha256-email>.json
└── users/<user-id>/
    ├── chats/<chat-id>.json
    ├── messages/<chat-id>/<message-id>.json
    ├── memories/<memory-id>.json
    └── attachments/<attachment-id>.json
```

Uploaded files remain in the existing private B2 file layout.

## Local development

Run:

```bash
npm install
npm run dev
```

Local development still uses the same B2 configuration, so the application behaves like production instead of relying on a machine-local SQLite database.

## Security notes

- Passwords use salted PBKDF2-SHA512 hashing.
- Auth tokens are stored in HTTP-only cookies.
- API keys stay server-side.
- The B2 bucket should remain private.
- User data is isolated by authenticated user ID and object prefixes.
- Account deletion removes stored user records and associated uploaded files.

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
| `/api/health` | GET | Check AI provider and B2 storage health |

## Important migration note

CarbonAI no longer depends on a local SQLite database or a third-party database provider. Existing Vercel `/tmp` database state is not durable; new deployments use Backblaze B2 as the persistent source of truth.

## License

MIT
