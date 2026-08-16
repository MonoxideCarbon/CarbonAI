# CarbonAI-Private v2.0

A fully self-contained, production-quality AI chatbot with **custom authentication**, **SQLite database**, and **Backblaze B2** storage.

## What's Different from v1

- **No Supabase** — Custom JWT auth with bcrypt + HTTP-only cookies
- **No Firebase** — Everything runs on your own server
- **SQLite** — Local file database, zero external database dependencies
- **Backblaze B2** — Private cloud storage for all files

## Features

- **Intelligent AI Routing** — Auto-selects best free model (Gemini → Groq → OpenRouter)
- **Automatic Failover** — Silently switches providers on failure
- **Custom Auth** — Sign up, login, email verification, password reset, account deletion
- **Backblaze B2 Storage** — Private file storage with 50MB limit per file
- **Web Search** — DuckDuckGo integration for current information
- **Voice** — Browser-native speech-to-text and text-to-speech
- **Memory** — Controlled long-term memory for personalisation
- **Themes** — Light, Dark, AMOLED, System
- **PWA** — Installable on mobile and desktop

## Architecture

| Component | Technology |
|-----------|------------|
| Auth | Custom JWT + bcryptjs + HTTP-only cookies |
| Database | SQLite (better-sqlite3) |
| File Storage | Backblaze B2 |
| AI Routing | Gemini → Groq → OpenRouter with health tracking |
| Frontend | Next.js 14 + Tailwind CSS + TypeScript |

## Setup

### 1. Backblaze B2

1. Sign up at [backblaze.com/b2](https://www.backblaze.com/b2)
2. Create a **private** bucket
3. Go to **App Keys** → **Create Application Key**
4. Copy: **Key ID**, **Application Key**, **Bucket ID**, **Bucket Name**

### 2. AI API Keys (All Free)

- **Gemini**: [aistudio.google.com](https://aistudio.google.com) → Create API key
- **Groq**: [console.groq.com](https://console.groq.com) → Sign up, get free API key
- **OpenRouter**: [openrouter.ai](https://openrouter.ai) → Sign up, get free credits key

### 3. Environment Variables

Create `.env.local`:

```
# REQUIRED: Generate a strong random string (64+ chars)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# REQUIRED: Backblaze B2
B2_KEY_ID=your_b2_key_id
B2_APPLICATION_KEY=your_b2_app_key
B2_BUCKET_ID=your_b2_bucket_id
B2_BUCKET_NAME=your-b2-bucket-name

# REQUIRED: AI Providers
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
OPENROUTER_API_KEY=your_openrouter_key

# OPTIONAL: SMTP for email verification & password reset
# If not set, verification/reset links are logged to console
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=CarbonAI <noreply@yourdomain.com>
```

### 4. Deploy

```bash
npm install
npm run build
npm start
```

**Note**: SQLite requires a **persistent server**. Deploy to VPS, Docker, Railway, Render, or any host with persistent disk. Not compatible with pure serverless (Vercel Hobby) unless you use an external SQLite provider.

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/signup` | POST | Create account |
| `/api/auth/login` | POST | Login, sets cookie |
| `/api/auth/logout` | POST | Clear cookie |
| `/api/auth/me` | GET | Current user |
| `/api/auth/verify` | GET | Email verification |
| `/api/auth/reset-request` | POST | Request password reset |
| `/api/auth/reset-confirm` | POST | Confirm password reset |
| `/api/auth/delete` | DELETE | Delete account |
| `/api/chat` | POST | Stream AI response |
| `/api/chat/list` | GET | List chats |
| `/api/chat/create` | POST | Create chat |
| `/api/chat/delete` | DELETE | Delete chat |
| `/api/upload` | POST/GET | Upload/download files |
| `/api/search` | POST | Web search |

## Security

- Passwords hashed with bcrypt (12 rounds)
- JWT tokens in HTTP-only, SameSite=Strict cookies
- No API keys exposed to client
- Backblaze B2 private bucket
- Input validation on all routes
- Account deletion wipes all data (SQLite + B2)

## License

MIT
