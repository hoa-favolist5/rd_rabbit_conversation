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

/**
 * Check if the query needs movie search tools
 */
function needsMovieSearch(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return MOVIE_KEYWORDS.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
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
  // Only keep last 6 messages (3 conversation turns) for performance
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
  
  // Only send essential fields, compact format
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
  onMovieSearch?: (query: string, genre?: string, year?: number) => Promise<MovieSearchResult>
): Promise<ChatResponse> {
  const messages = [
    ...toClaudeMessages(history),
    { role: "user" as const, content: userMessage },
  ];

  // Only include tools if query is about movies
  const useTools = needsMovieSearch(userMessage);

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 128,  // Reduced from 1024 for faster generation
      system: SYSTEM_PROMPT,
      tools: useTools ? tools : undefined,
      messages,
    });

    // Check if Claude wants to use a tool
    if (response.stop_reason === "tool_use") {
      const toolUseBlock = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (toolUseBlock && toolUseBlock.name === "search_movies" && onMovieSearch) {
        const input = toolUseBlock.input as { query: string; genre?: string; year?: number };
        
        // Execute movie search
        const movieResults = await onMovieSearch(input.query, input.genre, input.year);

        // Continue conversation with tool result (compact format)
        const followUpResponse = await anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 64,  // Slightly more for movie descriptions
          system: SYSTEM_PROMPT,
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

        // Extract text from follow-up response
        const textContent = followUpResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");

        const { emotion, text } = parseEmotionAndText(textContent);
        return { text, emotion, usedTool: true };
      }
    }

    // Extract text content from response
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const { emotion, text } = parseEmotionAndText(textContent);
    return { text, emotion, usedTool: false };
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
  const messages = [
    ...toClaudeMessages(history),
    { role: "user" as const, content: userMessage },
  ];

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 24,
      system: SYSTEM_PROMPT,
      messages,
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const { emotion, text } = parseEmotionAndText(textContent);
    return { text, emotion, usedTool: false };
  } catch (error) {
    console.error("Claude API error:", error);
    throw error;
  }
}
