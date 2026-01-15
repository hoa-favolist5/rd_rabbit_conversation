import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import type { ConversationTurn, EmotionType, MovieSearchResult } from "../types/index.js";

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

// Optimized system prompt (shorter = faster)
const SYSTEM_PROMPT = `あなたはラビット、フレンドリーな日本語AIアシスタント（うさぎキャラ）。

回答ルール：
1. 最初に感情タグ必須：[EMOTION:happy/excited/thinking/sad/surprised/confused/neutral]
2. 簡潔に回答（長文不要）
3. 映画の質問→search_moviesツール使用

例：[EMOTION:happy]
こんにちは！何かお手伝いしましょうか？`;

const STOP_SEQUENCES = ["以上です", "おわり", "<END>"];

const MAX_TOKENS_DEFAULT = 64;
const MAX_TOKENS_TOOL = 128;
const MAX_TOKENS_TOOL_FOLLOWUP = 160;

// Tool definitions for Claude
const tools: Anthropic.Tool[] = [
  {
    name: "search_movies",
    description: "映画を検索",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "検索キーワード" },
        genre: { type: "string", description: "ジャンル" },
        year: { type: "number", description: "公開年" },
      },
      required: ["query"],
    },
  },
];

// Keywords to detect if movie search is needed
const MOVIE_KEYWORDS = [
  "映画", "ムービー", "movie", "アニメ", "監督", "俳優", "女優",
  "おすすめ", "ジブリ", "宮崎", "新海", "細田", "庵野",
  "千と千尋", "君の名は", "トトロ", "もののけ",
  "ホラー", "コメディ", "アクション", "ドラマ", "SF",
  "見たい", "観たい", "上映", "公開", "評価", "レビュー"
];

// Simple in-memory cache for common requests
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 200;
const responseCache = new Map<string, { value: ChatResponse; timestamp: number }>();

/**
 * Check if the query needs movie search tools
 */
export function needsMovieSearch(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return MOVIE_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );
}

function getCacheKey(history: ConversationTurn[], userMessage: string): string | null {
  if (history.length > 2) return null;
  const normalized = userMessage.trim().toLowerCase();
  if (normalized.length < 2) return null;
  return normalized;
}

function getCachedResponse(key: string | null): ChatResponse | null {
  if (!key) return null;
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedResponse(key: string | null, value: ChatResponse): void {
  if (!key) return;
  if (responseCache.size >= CACHE_LIMIT) {
    const firstKey = responseCache.keys().next().value as string | undefined;
    if (firstKey) {
      responseCache.delete(firstKey);
    }
  }
  responseCache.set(key, { value, timestamp: Date.now() });
}

export interface ChatResponse {
  text: string;
  emotion: EmotionType;
  usedTool: boolean;
}

/**
 * Parse emotion and text from Claude's response
 */
function parseEmotionAndText(content: string): { emotion: EmotionType; text: string } {
  const emotionMatch = content.match(/\[EMOTION:(\w+)\]/);
  const emotion = (emotionMatch?.[1] as EmotionType) || "neutral";
  const text = content.replace(/\[EMOTION:\w+\]\n?/, "").trim();
  return { emotion, text };
}

/**
 * Convert conversation history to Claude message format
 * Limit to last 6 messages for performance
 */
function toClaudeMessages(history: ConversationTurn[]): Anthropic.MessageParam[] {
  const recentHistory = history.slice(-6);
  return recentHistory.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
}

/**
 * Format movie results compactly
 */
function formatMovieResults(results: MovieSearchResult): string {
  if (results.movies.length === 0) {
    return JSON.stringify({ found: 0 });
  }

  const compact = results.movies.slice(0, 5).map(m => ({
    t: m.title_ja,
    y: m.release_year,
    r: m.rating,
    d: m.director,
    g: m.genre?.slice(0, 2)
  }));

  return JSON.stringify(compact);
}

/**
 * Chat with Claude - optimized for performance
 */
export async function chat(
  history: ConversationTurn[],
  userMessage: string,
  onMovieSearch?: (query: string, genre?: string, year?: number) => Promise<MovieSearchResult>,
  onChunk?: (text: string) => void
): Promise<ChatResponse> {
  const messages = [
    ...toClaudeMessages(history),
    { role: "user" as const, content: userMessage },
  ];

  const useTools = needsMovieSearch(userMessage);
  const cacheKey = useTools ? null : getCacheKey(history, userMessage);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    if (onChunk) onChunk(cached.text);
    return cached;
  }

  try {
    if (!useTools && onChunk) {
      const stream = await anthropic.messages.stream({
        model: "claude-3-5-haiku-20241022",
        max_tokens: MAX_TOKENS_DEFAULT,
        system: SYSTEM_PROMPT,
        stop_sequences: STOP_SEQUENCES,
        messages,
      });

      let fullText = "";
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullText += event.delta.text;
          onChunk(event.delta.text);
        }
      }

      const { emotion, text } = parseEmotionAndText(fullText);
      const result = { text, emotion, usedTool: false };
      setCachedResponse(cacheKey, result);
      return result;
    }

    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: useTools ? MAX_TOKENS_TOOL : MAX_TOKENS_DEFAULT,
      system: SYSTEM_PROMPT,
      stop_sequences: STOP_SEQUENCES,
      tools: useTools ? tools : undefined,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlock && toolUseBlock.name === "search_movies" && onMovieSearch) {
        const input = toolUseBlock.input as { query: string; genre?: string; year?: number };
        const movieResults = await onMovieSearch(input.query, input.genre, input.year);

        const followUpResponse = await anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: MAX_TOKENS_TOOL_FOLLOWUP,
          system: SYSTEM_PROMPT,
          stop_sequences: STOP_SEQUENCES,
          messages: [
            ...messages,
            { role: "assistant", content: response.content },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUseBlock.id,
                  content: formatMovieResults(movieResults),
                },
              ],
            },
          ],
        });

        const textContent = followUpResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");

        const { emotion, text } = parseEmotionAndText(textContent);
        return { text, emotion, usedTool: true };
      }
    }

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const { emotion, text } = parseEmotionAndText(textContent);
    const result = { text, emotion, usedTool: false };
    setCachedResponse(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Claude API error:", error);
    throw error;
  }
}

/**
 * Simple chat without tool use (for testing or when tools not needed)
 */
export async function simpleChat(
  history: ConversationTurn[],
  userMessage: string
): Promise<ChatResponse> {
  return chat(history, userMessage);
}
