# CarbonAI-Private

A private AI chatbot with custom authentication, persistent Backblaze B2 storage, intelligent AI routing, web search, voice features, memory, themes, and Vercel deployment support.

## Production architecture

| Component | Technology |
|---|---|
| Hosting | Vercel / Next.js |
| Auth | Custom JWT + HTTP-only cookie |
| Persistent data | Backblaze B2 JSON objects |
| File storage | Backblaze B2 |
| AI routing | Gemini → Groq → OpenRouter with failover |
| Frontend | Next.js 14 + Tailwind CSS + TypeScript |

CarbonAI deliberately does not require a separate database service. User records, chat metadata, messages, memories, and attachment metadata are stored as private JSON objects in Backblaze B2. Uploaded files are stored in the same B2 bucket.

## Backblaze B2 layout

```text
carbonai/v1/
  users/<user-id>.json
  email-index/<sha256-email>.json
  verification-index/<sha256-token>.json
  reset-index/<sha256-token>.json
  users/<user-id>/chats/<chat-id>.json
  users/<user-id>/messages/<chat-id>/<message-id>.json
  users/<user-id>/memories/<memory-id>.json
  users/<user-id>/attachments/<attachment-id>.json
```

The application only accesses B2 from server-side code. Credentials are never exposed to the browser.

## Vercel setup

Add these environment variables to the **Production** environment of the CarbonAI Vercel project:

```text
JWT_SECRET=<long random secret>
ACCESS_KEY=<optional registration access key>

B2_KEY_ID=<your B2 key id>
B2_APPLICATION_KEY=<your B2 application key>
B2_BUCKET_ID=<your B2 bucket id>
B2_BUCKET_NAME=<your B2 bucket name>

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

At least one AI provider key is required for chat generation. B2 variables are required for production persistence.

Do not commit secrets to GitHub.

## Deployment

Vercel builds the project with:

```bash
npm run build
```

After deployment, verify:

```text
https://YOUR-DOMAIN/api/health
```

A healthy deployment reports `status: healthy` when at least one configured AI provider and B2 storage are working.

## Upload limit on Vercel

The `/api/upload` route accepts files up to **4 MB**. This is intentionally below Vercel's serverless function request-body limit. Larger files should be rejected by the UI/API rather than producing opaque deployment/runtime failures.

## Local development

```bash
npm install
npm run dev
```

Local development uses the same B2 backend when the B2 environment variables are present. There is no local SQLite database dependency.

## Security notes

- Passwords use salted PBKDF2-SHA512 hashing.
- Auth tokens are stored in HTTP-only cookies.
- Edge middleware verifies JWT signatures before protecting routes.
- API keys stay server-side.
- Backblaze B2 stores application data and uploaded files privately.
- Account deletion removes application objects and associated uploaded B2 files.

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
| `/api/health` | GET | Check AI provider and B2 health |

## Important migration note

The old local SQLite/Turso implementation is no longer part of CarbonAI. Production state is stored in Backblaze B2 so Vercel serverless instances share the same persistent source of truth.

## License

MIT
