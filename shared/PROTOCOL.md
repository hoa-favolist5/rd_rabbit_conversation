# Rabbit AI Communication Protocol

This document defines the WebSocket communication patterns between frontend and backend.

## Overview

The communication uses JSON messages over WebSocket. Each message has a `type` field that determines its structure.

## Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER INTERACTION FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User speaks/types                                                  │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────┐                                                │
│  │ Frontend        │                                                │
│  │ voice_event     │  ────────────────────────────►  Backend        │
│  │ { context,      │                                                │
│  │   event,        │                                                │
│  │   text }        │                                                │
│  └─────────────────┘                                                │
│                                                                     │
│                       ◄────────────────────────────                 │
│                       │                                             │
│                       ▼                                             │
│  ┌─────────────────┐                                                │
│  │ status          │  Rabbit status → "thinking"                    │
│  │ { rabbit:       │                                                │
│  │   {emotion,     │                                                │
│  │    status} }    │                                                │
│  └─────────────────┘                                                │
│                       │                                             │
│                       ▼                                             │
│  ┌─────────────────┐                                                │
│  │ response        │  Text content (streaming or final)             │
│  │ { rabbit,       │  + Optional component data                     │
│  │   text,         │                                                │
│  │   component,    │                                                │
│  │   context }     │                                                │
│  └─────────────────┘                                                │
│                       │                                             │
│                       ▼                                             │
│  ┌─────────────────┐                                                │
│  │ audio           │  Voice output (full or chunked)                │
│  │ { audio: {      │                                                │
│  │   data,         │                                                │
│  │   format,       │                                                │
│  │   chunk? } }    │                                                │
│  └─────────────────┘                                                │
│                       │                                             │
│                       ▼                                             │
│  ┌─────────────────┐                                                │
│  │ status          │  Rabbit status → "idle"                        │
│  │ { rabbit:       │                                                │
│  │   {emotion,     │                                                │
│  │    status} }    │                                                │
│  └─────────────────┘                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Backend → Frontend Messages

### 1. Response Message (Main content)

The primary message for assistant responses.

```typescript
interface ResponseMessage {
  type: "response";
  timestamp?: number;
  responseId?: string;
  
  // Rabbit character state
  rabbit: {
    emotion: EmotionType;     // "neutral" | "happy" | "excited" | "thinking" | etc.
    status: ConversationStatus; // "idle" | "listening" | "thinking" | "speaking"
  };
  
  // Text content
  text: {
    content: string;
    isStreaming: boolean;  // true = delta update, false = complete
    messageId: string;     // For tracking streaming updates
  };
  
  // Optional: Component to render
  component?: {
    type: "movie_list" | "gourmet_list" | "archive_confirm" | "friend_match" | null;
    data: MovieListData | GourmetListData | ArchiveConfirmData | FriendMatchData | null;
  };
  
  // Optional: Conversation context
  context?: {
    domain: DomainType;  // "movie" | "gourmet" | "general"
    intent?: string;
  };
  
  // Optional: Extra metadata
  extra?: {
    archiveItem?: ArchiveItemInfo;
    timing?: WorkflowTiming;
    [key: string]: unknown;
  };
}
```

### 2. Status Message (State updates)

Lightweight status updates without full response data.

```typescript
interface StatusMessage {
  type: "status";
  rabbit: {
    emotion: EmotionType;
    status: ConversationStatus;
  };
  statusText?: string;
}
```

### 3. Audio Message (Voice output)

Supports both full audio and chunked streaming.

```typescript
interface AudioMessage {
  type: "audio";
  responseId?: string;
  
  audio: {
    data: string;           // base64 encoded
    format: "mp3" | "wav";
    isChunked: boolean;
    chunk?: {
      index: number;
      total: number;
      isLast: boolean;
    };
    isProtected: boolean;   // true = cannot be interrupted
  };
  
  text?: string;  // Optional: text being spoken (for captions)
}
```

### 4. Error Message

Structured error with recovery information.

```typescript
interface ErrorMessage {
  type: "error";
  error: {
    code: ErrorCode;        // "NETWORK_ERROR" | "AUTH_ERROR" | "TTS_ERROR" | etc.
    message: string;
    recoverable: boolean;   // Can user retry?
  };
}
```

## Frontend → Backend Messages

### Voice Event Message (Unified input)

All user interactions use this single message type.

```typescript
interface VoiceEventMessage {
  type: "voice_event";
  timestamp?: number;
  
  // Context
  context: {
    userId?: string;
    sessionId?: string;
    domain?: DomainType;
  };
  
  // Event info
  event: {
    name: EventName;    // "text_input" | "save_archive" | "load_history" | etc.
    action: EventAction; // "send" | "start" | "stop" | "save" | "load" | "request"
  };
  
  // Text content (for text_input)
  text?: string;
  
  // Parameters (for specific events)
  params?: {
    itemId?: string;
    itemTitle?: string;
    itemData?: Record<string, unknown>;
    domain?: DomainType;
    limit?: number;
    [key: string]: unknown;
  };
  
  extra?: Record<string, unknown>;
}
```

## Component Data Structures

### Movie List

```typescript
interface MovieListData {
  movies: Movie[];
  total: number;
  query?: string;
}

interface Movie {
  id: number | null;
  title_ja: string;
  title_en: string | null;
  description: string | null;
  release_year: number | null;
  rating: number | null;
  director: string | null;
  actors: string[];
}
```

### Gourmet List

```typescript
interface GourmetListData {
  restaurants: GourmetRestaurant[];
  total: number;
  query?: string;
  area?: string;
}

interface GourmetRestaurant {
  id: number | null;
  code: string | null;
  name: string;
  address: string | null;
  catch_copy: string | null;
  access: string | null;
  urls_pc: string | null;
  open_hours: string | null;
  // ... more fields
}
```

## Backward Compatibility

The system supports both legacy and new message formats:

### Legacy Messages (still supported)

| Legacy Type | New Equivalent |
|-------------|----------------|
| `assistant_message` | `response` |
| `assistant_delta` | `response` with `text.isStreaming=true` |
| `audio` (flat) | `audio` with nested `audio` object |
| `audio_chunk` | `audio` with `audio.isChunked=true` |
| `long_waiting` | `audio` with `audio.isProtected=true` |
| `text_input` | `voice_event` with `event.name="text_input"` |

### Migration Path

1. **Phase 1** (Current): Both formats sent, frontend handles both
2. **Phase 2**: Enable new format in frontend, test thoroughly  
3. **Phase 3**: Deprecate legacy format

## Type Safety

Import types from `@rabbit/shared`:

```typescript
import type {
  ResponseMessage,
  StatusMessage,
  AudioMessage,
  ErrorMessage,
  VoiceEventMessage,
  // Type guards
  isResponseMessage,
  isStatusMessage,
  // Helper functions
  createResponseMessage,
  createVoiceEventMessage,
} from "@rabbit/shared";
```

## Example: Sending a Text Message

### Legacy Format
```typescript
ws.send(JSON.stringify({
  type: "text_input",
  text: "映画を探して"
}));
```

### New Format
```typescript
import { createVoiceEventMessage } from "@rabbit/shared";

const message = createVoiceEventMessage("text_input", "send", {
  userId: "123",
  text: "映画を探して"
});
ws.send(JSON.stringify(message));
```

## Example: Handling Response

```typescript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  // Handle new format
  if (message.type === "response") {
    const { rabbit, text, component } = message;
    
    // Update rabbit character
    setEmotion(rabbit.emotion);
    setStatus(rabbit.status);
    
    // Handle text (streaming or complete)
    if (text.isStreaming) {
      appendToMessage(text.messageId, text.content);
    } else {
      setMessage(text.messageId, text.content);
    }
    
    // Render component if present
    if (component?.type === "movie_list") {
      renderMovieList(component.data);
    }
  }
  
  // Handle legacy format (backward compatibility)
  if (message.type === "assistant_message") {
    // ... legacy handling
  }
};
```
