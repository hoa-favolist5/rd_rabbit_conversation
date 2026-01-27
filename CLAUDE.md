# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rabbit is a real-time voice AI avatar application with streaming conversation capabilities. It combines voice input (AWS Transcribe), LLM processing (Claude 3.5 Haiku), and voice output (Google Cloud TTS) with a Lottie-animated avatar.

## Commands

```bash
# Development (starts both frontend:3000 and backend:3001)
npm run dev

# Individual servers
npm run dev:backend      # Backend with file watching (tsx)
npm run dev:frontend     # Next.js dev server

# Build
npm run build            # Build both
npm run build:backend    # TypeScript to dist/
npm run build:frontend   # Next.js production build

# Database
npm run db:setup # Initialize PostgreSQL with movie schema

# Audio Generation
npm run generate:short-waiting # Generate short waiting audio files (backend)

# Install
npm run install:all # Install root + backend + frontend deps
```

## Architecture

```
Frontend (Next.js 15, port 3000)
├── AWS Transcribe Streaming (direct, no backend proxy)
├── WebSocket client → ws://localhost:3001/ws
├── Lottie avatar with 9 emotion states
└── RNNoise integration (disabled by default)

Backend (Express, port 3001)
├── WebSocket server (conversation handler)
├── Claude 3.5 Haiku (with Tool Use for movie search)
├── Google Cloud TTS (emotion-based voice, ja-JP-Neural2-B)
└── PostgreSQL connection (movie database)

Database: PostgreSQL (port 5432, Docker)
```

## Key Files

**Frontend** (`frontend/src/`):
- `app/page.tsx` - Main conversation page, orchestrates all hooks
- `hooks/useAWSTranscribe.ts` - Voice input streaming to AWS
- `hooks/useAudioPlayer.ts` - Audio playback with barge-in detection
- `hooks/useWebSocket.ts` - WebSocket connection and message handling
- `hooks/useWaitingPhrase.ts` - Filler audio during LLM processing
- `components/RabbitAvatar.tsx` - Lottie animation controller

**Backend** (`backend/src/`):
- `index.ts` - Express server entry, WebSocket setup
- `websocket/handler.ts` - Message routing, conversation flow
- `services/claude.ts` - Claude API with streaming, Tool Use, emotion detection
- `services/google-tts.ts` - Google Cloud TTS with emotion-based voice parameters
- `services/long-waiting.ts` - Context-aware waiting phrase generation
- `db/movies.ts` - PostgreSQL movie queries
- `utils/logger.ts` - Structured logging utility (debug mode via DEBUG=true)

## Environment Setup

**Backend** (`backend/.env`):
```env
PORT=3001
ANTHROPIC_API_KEY=sk-ant-...

# Google Cloud TTS
GOOGLE_APPLICATION_CREDENTIALS=./gourmet-search-place-tts.json
GOOGLE_TTS_VOICE=ja-JP-Neural2-B

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rabbit_movies
DB_USER=postgres
DB_PASSWORD=...

# Debug mode (enables verbose logging)
DEBUG=true
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_AWS_REGION=ap-northeast-1
NEXT_PUBLIC_AWS_ACCESS_KEY_ID=...
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY=...
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_BARGE_IN_MIN_CHARS=5
NEXT_PUBLIC_EARLY_BARGE_IN_MIN_CHARS=2
NEXT_PUBLIC_WAITING_THRESHOLD=1000
```

## WebSocket Message Protocol

Messages use discriminated union pattern with `type` field:

```typescript
// Client → Server
{ type: "user_message", text: string }
{ type: "cancel" }

// Server → Client
{ type: "status", status: "idle"|"listening"|"thinking"|"speaking" }
{ type: "assistant_chunk", text: string }
{ type: "assistant_message", text: string, emotion: EmotionType }
{ type: "audio", audio: string (base64), sequence: number, isFinal: boolean }
{ type: "timing", timings: {...} }
```

## Emotion System

9 emotion states: `neutral`, `happy`, `excited`, `thinking`, `sad`, `surprised`, `confused`, `listening`, `speaking`

- Claude outputs `[EMOTION:xxx]` tag at response start
- Parsed in `services/claude.ts:parseEmotionAndText()`
- Google TTS uses emotion for voice styling
- Frontend displays corresponding Lottie animation

## Two-Tier Waiting System

**Tier 1: Short Waiting (> 1s)**
- Trigger: Backend does NOT respond within 1s threshold
- Audio: `/waiting-short/0-9.mp3` (10 sounds, generated via `npm run generate:short-waiting`)
- Examples: "ああ" (ah), "うん" (un), "えっと" (etto)
- Randomization: 50% chance to play sound, 50% chance silent waiting
- Voice: Same TTS voice as responses (Google TTS, "speaking" emotion)
- Behavior: Protected playback, then 400ms delay before backend audio

**Tier 2: Long Waiting (Server-Side Database Operations)**
- Trigger: Tool use detected (movie search)
- Generation: Real-time TTS with context
- Examples: "アクション映画ですね、今探していますので少々お待ちください。"
- Voice: Same TTS voice as responses (Google TTS, "speaking" emotion)
- Features: Confirms query/genre/year, streams immediately
- Cancels client-side short waiting if not yet triggered

**Fast Responses (< 1s)**
- NO waiting sound
- Backend response plays immediately

**Voice Consistency**
- All audio (short waiting, long waiting, responses) uses same Google TTS voice
- Reduced pitch/rate variations across emotions for consistent speaker identity
- Emotions provide subtle variations without sounding like different people

## Barge-in (Interruption) System

When user speaks during playback:
1. Partial transcript (2+ chars) triggers early stop
2. Audio queue cleared immediately
3. Final transcript (5+ chars) submits new message
4. Thresholds configurable via `NEXT_PUBLIC_*` env vars

## TypeScript Conventions

- Frontend path alias: `@/*` maps to `./src/*`
- Backend output: `dist/` directory
- Both use strict mode, ES2022 target
- Shared types defined in `types/index.ts` (both packages)

## Branch Context

- **Current**: `main_lottie_rrnoise` (RNNoise integration)
- **Main**: `main`
- **Others**: `gemini` (alternative LLM), `main_lottie_transcribe`
