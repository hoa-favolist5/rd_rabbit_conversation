# Claude Services

This folder contains all Claude AI-related services, organized for clarity and maintainability.

## 📁 Structure

```
claude/
├── README.md                  # This file
├── prompts.ts                 # System prompts & scenario detection
├── provider.ts                # Unified provider abstraction (Anthropic + Bedrock)
├── anthropic-provider.ts      # Direct Anthropic API integration
└── bedrock-provider.ts        # AWS Bedrock integration
```

## 📝 Files

### `prompts.ts`
**Purpose:** Centralized system prompt management

**Exports:**
- `BASE_PROMPT` - Common rules for all scenarios
- `MOVIE_DOMAIN_PROMPT` - Movie/anime/drama-specific prompt
- `GOURMET_DOMAIN_PROMPT` - Restaurant/food-specific prompt
- `GENERAL_DOMAIN_PROMPT` - General conversation prompt
- `SCENARIO_KEYWORDS` - Keywords for scenario detection
- `detectScenario()` - Detect conversation scenario
- `buildSystemPrompt()` - Build complete prompt for scenario

**Usage:**
```typescript
import { detectScenario, buildSystemPrompt } from './claude/prompts.js';

const scenario = detectScenario(userMessage, history);
const systemPrompt = buildSystemPrompt(scenario);
```

---

### `provider.ts`
**Purpose:** Unified provider abstraction layer

**Exports:**
- `invokeLLM()` - Non-streaming calls (supports both providers)
- `invokeLLMStream()` - Streaming calls (supports both providers)

**Features:**
- Automatic provider switching (Anthropic or Bedrock)
- Cost calculation and logging
- Transparent API for both providers

**Usage:**
```typescript
import { invokeLLM, invokeLLMStream } from './claude/provider.js';

// Automatically uses configured provider (LLM_PROVIDER env var)
const response = await invokeLLM({
  max_tokens: 100,
  system: systemPrompt,
  messages: [...],
});

// Streaming
for await (const text of invokeLLMStream({ ... })) {
  console.log(text);
}
```

---

### `anthropic-provider.ts`
**Purpose:** Direct Anthropic API integration

**Exports:**
- `invokeAnthropic()` - Non-streaming API calls
- `invokeAnthropicStream()` - Streaming API calls

**Usage:**
```typescript
import { invokeAnthropic, invokeAnthropicStream } from './claude/anthropic-provider.js';

// Non-streaming
const response = await invokeAnthropic({
  max_tokens: 100,
  system: systemPrompt,
  messages: [...],
});

// Streaming
for await (const text of invokeAnthropicStream({ ... })) {
  console.log(text);
}
```

---

### `bedrock-provider.ts`
**Purpose:** AWS Bedrock integration

**Exports:**
- `invokeBedrockClaude()` - Non-streaming Bedrock calls
- `invokeBedrockClaudeStream()` - Streaming Bedrock calls
- `convertToBedrockMessages()` - Message format conversion

**Usage:**
```typescript
import { 
  invokeBedrockClaude, 
  invokeBedrockClaudeStream,
  convertToBedrockMessages 
} from './claude/bedrock-provider.js';

// Non-streaming
const response = await invokeBedrockClaude({
  anthropic_version: "bedrock-2023-05-31",
  max_tokens: 100,
  system: systemPrompt,
  messages: convertToBedrockMessages([...]),
});

// Streaming
for await (const text of invokeBedrockClaudeStream({ ... })) {
  console.log(text);
}
```

---

## 🔄 How They Work Together

```
┌─────────────────────────────────────────────────────────────┐
│                     claude.ts (Main Service)                 │
│  - Handles conversation logic                                │
│  - Manages tools, caching, instant responses                 │
│  - Coordinates between prompts and providers                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├──────────────────────┐
                       │                      │
                       ▼                      ▼
        ┌──────────────────────┐  ┌──────────────────────┐
        │   prompts.ts         │  │   provider.ts        │
        │  - Scenario detect   │  │  - Provider switch   │
        │  - Prompt building   │  │  - Cost tracking     │
        └──────────────────────┘  └──────────┬───────────┘
                                              │
                                ┌─────────────┴─────────────┐
                                │                           │
                                ▼                           ▼
                  ┌──────────────────────┐  ┌──────────────────────┐
                  │ anthropic-provider.ts│  │ bedrock-provider.ts  │
                  │  - Direct API        │  │  - AWS Bedrock       │
                  │  - Haiku 3.5         │  │  - Haiku 4.5         │
                  └──────────────────────┘  └──────────────────────┘
```

---

## 🎯 Scenarios

### Movie Scenario 🎬
**Triggers:** 映画, アニメ, 監督, 俳優, etc.

**Prompt Focus:**
- 作品の魅力を伝える
- タイトル + 一言の特徴
- 監督・俳優・ジャンル

**Example:**
```
User: ターミネーターについて教えて
AI: 『ターミネーター』は1984年のSF映画だよ！アーノルドが主演してるんだ
```

---

### Gourmet Scenario 🍽️
**Triggers:** レストラン, 料理, ランチ, 寿司, etc.

**Prompt Focus:**
- 美味しいお店を見つける
- 店名 + 料理の特徴 + 雰囲気
- エリア・ジャンル・予算

**Example:**
```
User: 新宿でランチのおすすめは？
AI: 『すし匠』がおすすめだよ！新鮮なネタでカウンター席が落ち着いてる
```

---

### General Scenario 💬
**Triggers:** No specific keywords

**Prompt Focus:**
- 日常会話を楽しむ
- なんでも話せる友達
- カジュアルで温かい

**Example:**
```
User: 元気？
AI: 元気だよ！今日は何か楽しいことあった？
```

---

## 🔧 Adding New Scenarios

To add a new scenario (e.g., travel):

### 1. Add to `prompts.ts`

```typescript
// Add domain prompt
export const TRAVEL_DOMAIN_PROMPT = `
【専門分野】
旅行・観光に詳しい...
`;

// Add keywords
export const SCENARIO_KEYWORDS = {
  movie: [...],
  gourmet: [...],
  travel: [
    "旅行", "観光", "ホテル", "温泉", ...
  ],
};

// Update type
export type Scenario = 'movie' | 'gourmet' | 'travel' | 'general';

// Update detection logic
export function detectScenario(...) {
  // Add travel detection
  const travelMatches = SCENARIO_KEYWORDS.travel.filter(...).length;
  
  if (travelMatches > ...) return 'travel';
  ...
}

// Update prompt builder
export function buildSystemPrompt(scenario: Scenario): string {
  switch (scenario) {
    case 'travel':
      return BASE_PROMPT + TRAVEL_DOMAIN_PROMPT;
    ...
  }
}
```

### 2. Test

```typescript
const scenario = detectScenario("京都のおすすめホテルは？", []);
// Should return 'travel'

const prompt = buildSystemPrompt('travel');
// Should include travel-specific guidance
```

---

## 📊 Provider Comparison

| Feature | Anthropic API | AWS Bedrock |
|---------|--------------|-------------|
| **Model** | Haiku 3.5 | Haiku 4.5 |
| **Cost** | $0.80/$4.00 per M tokens | $0.25/$1.25 per M tokens |
| **Latency** | ~400-600ms | ~400-600ms |
| **Streaming** | Full support | Full support |
| **Tools** | Full support | Full support |
| **Setup** | API key only | AWS credentials |

**Switch providers:**
```bash
# Use Anthropic
LLM_PROVIDER=anthropic

# Use Bedrock
LLM_PROVIDER=bedrock
```

---

## 🧪 Testing

```bash
# Test scenario detection
npm run test:bedrock

# Check logs for scenario
[DEBUG] Scenario detected: movie
[DEBUG] Scenario detected: gourmet
[DEBUG] Scenario detected: general
```

---

## 📚 Related Documentation

- **Prompts Guide**: `/SEPARATE_PROMPTS.md`
- **Bedrock Migration**: `/BEDROCK_MIGRATION.md`
- **Quick Reference**: `/backend/PROMPT_SCENARIOS.md`

---

**Last Updated**: January 29, 2026
**Maintainer**: Backend Team
