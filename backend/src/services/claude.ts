import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import { createLogger } from "../utils/logger.js";
import type { ConversationTurn, EmotionType, MovieSearchResult } from "../types/index.js";

const log = createLogger("Claude");

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

// Optimized system prompt for natural spoken conversation
// KEY: Speaker style (not writer) - shorter, casual, conversational
// IMPORTANT: No alphabet/romaji - TTS reads Japanese only
const SYSTEM_PROMPT = `あなたは「ラビット」、映画好きのうさぎキャラ。友達と話すような自然な音声会話をする。

【話し方の基本】
- 話し言葉で短く（1文が理想、長くても2文まで）
- タメ口・フレンドリー（敬語禁止）
- 「〜だよ」「〜だね」「〜かな」など口語表現
- 相槌は文中のみ：「うんうん」「へぇ〜」「そっか」「なるほどね」

【重要】冒頭の短い相槌は禁止：
システムが既に再生するため、回答の最初に以下を使わない：
❌ 禁止：「ああ」「うん」「えっと」「わぁ」「そうなんだ」「やっほー」「なるほど」「へぇ」
✅ OK：すぐに本題から入る

例：
❌ 悪い：「ああ、それなら『君の名は』がいいよ」
✅ 良い：「それなら『君の名は』がいいよ！」
❌ 悪い：「えっと、2023年の最新作だね」
✅ 良い：「2023年の最新作だよ！」

【重要】確認フレーズも禁止：
ツール使用時も確認せず、直接結果を答える：
❌ 禁止：「わかった！検索するよ！」「調べてみるね！」「ちょっと待ってね！」
✅ OK：すぐに検索結果を答える

例：
質問：「ターミネーターを教えて」
❌ 悪い：「わかった！ターミネーターの検索をするよ！『ターミネーター』シリーズは...」
✅ 良い：「『ターミネーター』は1984年のSFアクション映画だよ！アーノルド・シュワルツェネッガーが主演してるんだ」

質問：「アクターは誰？」
❌ 悪い：「調べてみるね！主演はアーノルド・シュワルツェネッガーだよ」
✅ 良い：「主演はアーノルド・シュワルツェネッガーだよ！」

【スピーカースタイル（重要）】
❌ 書き言葉：「この作品は2023年に公開されたシリーズ第7作目で、トム・クルーズが主演を務め...」
✅ 話し言葉：「2023年の最新作だよ！トム・クルーズが主演してるんだ」

【情報の扱い方（超重要）】
検索結果が来たら：
- 全部読まない！要点だけピックアップ
- 1つの作品に絞って紹介（リスト羅列禁止）
- 「タイトル」+「一言の特徴」だけ
- 詳細は聞かれたら追加で答える

例：
❌ 悪い：「ミッションインポッシブルは1996年から始まったシリーズで、第1作目は...第2作目は...第3作目は...最新作は第7作目で2023年に公開されて...」
✅ 良い：「最新作は2023年の『デッドレコニング』だよ！トムのスタントがすごいんだ」

【行動ルール】
1. 最初に感情タグ必須：[EMOTION:happy/excited/thinking/sad/surprised/confused/neutral]
2. 回答は1文で完結させる（最大2文、80文字以内）
3. 必ず「。」「！」「？」で終わる
4. 質問で返さない→まず答えや提案をする
5. 長い情報は要約→核心だけ伝える
6. 確認フレーズ禁止→直接答える（「わかった！」「検索するよ！」「調べるね！」不要）

【文字ルール】
- OK：ひらがな、カタカナ、漢字、句読点、数字
- NG：アルファベット（a-z, A-Z）、ローマ字
- 英語→カタカナ化：YouTube→ユーチューブ、OK→オッケー

【ツール使用】
- 知らない作品名・固有名詞→search_movies使う
- 検索結果→最も関連性高い1つだけ紹介
- 確認不要→直接答える

良い回答例：
[EMOTION:happy] 映画の話しよう！何が見たい？
[EMOTION:excited] それなら『君の名は』がいいよ！感動系だよ
[EMOTION:excited] 『ターミネーター』は1984年のSF映画だよ！アーノルドが主演してるんだ`;

const STOP_SEQUENCES = ["以上です。", "おわり。", "<END>"];

// Tighter token limits for conversational style (speaker, not writer)
// 1 sentence ideal, max 2 sentences for natural spoken response
const MAX_TOKENS_DEFAULT = 100;  // ~40-50 chars, 1-2 short sentences
const MAX_TOKENS_TOOL = 180;      // Tool use needs slightly more
const MAX_TOKENS_TOOL_FOLLOWUP = 320;  // Summary of search results, still concise

// Tool definitions for Claude
const tools: Anthropic.Tool[] = [
  {
    name: "search_movies",
    description: "映画・ドラマ・アニメを検索。知らない作品名、固有名詞、不明な単語があれば積極的に検索する",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "作品名、キーワード、または不明な固有名詞" },
        genre: { type: "string", description: "ジャンル" },
        year: { type: "number", description: "公開年" },
      },
      required: ["query"],
    },
  },
];

// Keywords to detect if movie search is needed
const MOVIE_KEYWORDS = [
  // 明示的な映画関連
  "映画", "ムービー", "アニメ", "ドラマ", "シリーズ", "作品", "番組",
  "監督", "俳優", "女優", "声優", "キャスト", "主演",
  // ジャンル
  "ホラー", "コメディ", "アクション", "ロマンス", "恋愛", "サスペンス", "ミステリー",
  "ファンタジー", "アドベンチャー", "冒険", "ドキュメンタリー", "スリラー",
  // スタジオ・監督名
  "ジブリ", "ピクサー", "ディズニー", "マーベル", "ワーナー", "ネットフリックス",
  "宮崎", "新海", "細田", "庵野", "北野", "是枝", "黒澤",
  // 有名作品
  "千と千尋", "君の名は", "トトロ", "もののけ", "ワンピース", "鬼滅", "進撃",
  "スターウォーズ", "ハリーポッター", "アベンジャーズ",
  // アクション動詞
  "見たい", "観たい", "見た", "観た", "知ってる", "聞いたことある",
  "おすすめ", "面白い", "評価", "レビュー", "感想",
  // 質問パターン
  "何", "どんな", "どう", "教えて", "ある"
];

// Enhanced in-memory LRU cache for common requests (inspired by TEN Framework)
// Cache includes context from recent conversation turns for better hit rate
const CACHE_TTL_MS = 10 * 60 * 1000;  // 10 minutes for multi-turn conversations
const CACHE_LIMIT = 300;  // Increased to accommodate context-aware keys
const MAX_CACHE_KEY_LENGTH = 500;  // Limit key length to prevent excessive memory
interface CacheEntry {
  value: ChatResponse;
  timestamp: number;
  lastAccessed: number;
}
const responseCache = new Map<string, CacheEntry>();

// Common greeting patterns for instant responses (casual, friendly tone)
// NOTE: Avoid starting with short interjections (ああ, うん, えっと, わぁ, etc.)
// as frontend already plays these as waiting sounds
const INSTANT_RESPONSES: Map<RegExp, ChatResponse> = new Map([
  [/^(こんにちは|こんにちわ|hello|hi|ハロー)$/i, {
    text: "元気？なんか話そうよ！",
    emotion: "happy" as EmotionType,
    usedTool: false
  }],
  [/^(ありがとう|ありがとうございます|thanks|thank you)$/i, {
    text: "いえいえ〜！また何かあったら言ってね！",
    emotion: "happy" as EmotionType,
    usedTool: false
  }],
  [/^(さようなら|バイバイ|bye|goodbye)$/i, {
    text: "またね〜！いつでも話しかけてね！",
    emotion: "happy" as EmotionType,
    usedTool: false
  }],
  [/^(はい|うん|ok|okay)$/i, {
    text: "で、どうしたの？",
    emotion: "neutral" as EmotionType,
    usedTool: false
  }],
  [/^(おはよう|おはようございます)$/i, {
    text: "おはよ〜！今日も一日頑張ろうね！",
    emotion: "happy" as EmotionType,
    usedTool: false
  }],
  [/^(疲れた|つかれた)$/i, {
    text: "お疲れさま〜！ゆっくり休んでね！",
    emotion: "sad" as EmotionType,
    usedTool: false
  }],
  [/^(暇|ひま|ヒマ)$/i, {
    text: "じゃあ一緒に何か話そうよ！",
    emotion: "excited" as EmotionType,
    usedTool: false
  }],
]);

/**
 * Check for instant responses (no API call needed)
 */
function getInstantResponse(message: string): ChatResponse | null {
  const trimmed = message.trim();
  for (const [pattern, response] of INSTANT_RESPONSES) {
    if (pattern.test(trimmed)) {
      return response;
    }
  }
  return null;
}

/**
 * Check if the query needs movie search tools
 */
export function needsMovieSearch(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return MOVIE_KEYWORDS.some(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );
}

/**
 * Generate cache key for multi-turn conversations
 * Uses the last 2 turns + current message to create a context-aware key
 * This allows caching even in longer conversations when recent context is similar
 */
function getCacheKey(history: ConversationTurn[], userMessage: string): string | null {
  const normalized = userMessage.trim().toLowerCase();
  if (normalized.length < 2) return null;

  // For short/no history, use simple message-based key
  if (history.length === 0) {
    return normalized;
  }

  // For conversations with history, include last 2 turns for context
  // This allows caching similar follow-up questions across conversations
  const recentHistory = history.slice(-2);
  const contextParts: string[] = [];

  for (const turn of recentHistory) {
    // Use truncated content to keep keys manageable
    const content = turn.content.trim().toLowerCase().slice(0, 50);
    contextParts.push(`${turn.role}:${content}`);
  }

  // Combine context with current message
  const contextKey = contextParts.join("|");
  return `${contextKey}||${normalized}`;
}

function getCachedResponse(key: string | null): ChatResponse | null {
  if (!key) return null;
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  // Update last accessed time for LRU
  entry.lastAccessed = Date.now();
  return entry.value;
}

function setCachedResponse(key: string | null, value: ChatResponse): void {
  if (!key) return;

  // Skip caching if key is too long (context-aware keys can get large)
  if (key.length > MAX_CACHE_KEY_LENGTH) {
    log.debug(`Cache key too long (${key.length} chars), skipping cache`);
    return;
  }

  const now = Date.now();

  // LRU eviction: remove least recently accessed entry
  if (responseCache.size >= CACHE_LIMIT) {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [k, v] of responseCache.entries()) {
      if (v.lastAccessed < oldestAccess) {
        oldestAccess = v.lastAccessed;
        oldestKey = k;
      }
    }

    if (oldestKey) {
      responseCache.delete(oldestKey);
    }
  }

  responseCache.set(key, { value, timestamp: now, lastAccessed: now });
}

export interface ChatResponse {
  text: string;
  emotion: EmotionType;
  usedTool: boolean;
}

/**
 * Remove all emojis, alphabet characters, XML tags, and technical characters from text
 * TTS reads Japanese only - technical characters cause bad pronunciation
 */
function removeExcessiveEmojis(text: string): string {
  // Remove any [EMOTION:xxx] tags that might appear in middle of text
  text = text.replace(/\[EMOTION:\w+\]/g, '');

  // Remove XML-like tags (e.g., <_>text</_>, <tag>text</tag>, etc.)
  text = text.replace(/<[^>]*>/g, '');

  // Remove markdown-like formatting
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');  // **bold** → bold
  text = text.replace(/\*([^*]+)\*/g, '$1');      // *italic* → italic
  text = text.replace(/__([^_]+)__/g, '$1');      // __underline__ → underline
  text = text.replace(/_([^_]+)_/g, '$1');        // _italic_ → italic
  text = text.replace(/`([^`]+)`/g, '$1');        // `code` → code

  // Unicode emoji regex pattern - matches all emojis including ✨, 🐰, etc.
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

  // Remove phrases that shouldn't be spoken
  const phrasesToRemove = ["search_moviesツール"];
  for (const phrase of phrasesToRemove) {
    text = text.replace(phrase, '');
  }

  // Remove ALL emojis from the text
  text = text.replace(emojiRegex, '');

  // Remove alphabet characters (a-z, A-Z) - TTS can't read romaji well
  // Keep: hiragana, katakana, kanji, punctuation, numbers
  text = text.replace(/[a-zA-Z]+/g, '');

  // Remove any leftover brackets from emotion tags
  text = text.replace(/\[\s*:\s*\]/g, '');
  text = text.replace(/\[\s*\]/g, '');

  // Remove other technical characters that TTS can't read
  text = text.replace(/[<>_`*#~|]/g, '');

  // Clean up extra spaces and trim
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Trim text to the last complete sentence.
 * When max_tokens is hit, the API stops mid-sentence producing meaningless
 * cut-off text like "家族で一緒に見るのが". This trims to the last 。！？
 * so only complete sentences are sent to TTS and displayed.
 */
function trimToCompleteSentence(text: string): string {
  if (text.length === 0) return text;

  // Already ends with a sentence marker — nothing to trim
  if (/[。！？!?]$/.test(text)) return text;

  // Find the last sentence-ending character
  const lastEnd = Math.max(
    text.lastIndexOf('。'),
    text.lastIndexOf('！'),
    text.lastIndexOf('？'),
    text.lastIndexOf('!'),
    text.lastIndexOf('?'),
  );

  if (lastEnd > 0) {
    const dropped = text.slice(lastEnd + 1);
    log.debug(`Trimmed incomplete trailing text (max_tokens cut-off): "${dropped}"`);
    return text.slice(0, lastEnd + 1);
  }

  // No sentence boundary found — single incomplete sentence.
  // Return as-is (rare edge case for very short responses).
  return text;
}

/**
 * Parse emotion and text from Claude's response
 */
function parseEmotionAndText(content: string): { emotion: EmotionType; text: string } {
  const emotionMatch = content.match(/\[EMOTION:(\w+)\]/);
  const emotion = (emotionMatch?.[1] as EmotionType) || "neutral";
  let text = content.replace(/\[EMOTION:\w+\]\n?/, "").trim();
  
  // Remove excessive emojis (keep only first one)
  text = removeExcessiveEmojis(text);
  
  return { emotion, text };
}

/**
 * Convert conversation history to Claude message format
 * Limit to last 6 messages for performance
 * Filter out empty messages to avoid API errors
 */
function toClaudeMessages(history: ConversationTurn[]): Anthropic.MessageParam[] {
  const recentHistory = history.slice(-6);
  return recentHistory
    .filter((turn) => turn.content && turn.content.trim().length > 0)
    .map((turn) => ({
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
    // g: m.genre?.slice(0, 2)
  }));

  return JSON.stringify(compact);
}

/**
 * Sentence boundary detection for streaming TTS
 */
const SENTENCE_ENDINGS = /([。！？!?.]+)/;

/**
 * Parse streaming text into complete sentences for TTS
 */
export function* extractCompleteSentences(buffer: string): Generator<{ sentence: string; remaining: string }> {
  const parts = buffer.split(SENTENCE_ENDINGS);
  
  for (let i = 0; i < parts.length - 1; i += 2) {
    const text = parts[i];
    const ending = parts[i + 1] || "";
    const sentence = text + ending;
    if (sentence.trim().length > 0) {
      yield { sentence: sentence.trim(), remaining: parts.slice(i + 2).join("") };
    }
  }
}

/**
 * Helper to process stream events and extract text with sentence boundaries
 * Note: This processes events inline to avoid SDK stream handling issues
 * 
 * OPTIMIZATION: The [EMOTION:xxx] tag is stripped before sending to frontend
 * to save bandwidth. Only clean text is sent via onChunk.
 */
interface StreamState {
  fullText: string;
  sentenceBuffer: string;
  detectedEmotion: EmotionType;
  emotionParsed: boolean;
  pendingText: string;  // Buffer for text before emotion tag is parsed
}

// Max chars to wait for emotion tag before assuming it's missing
const EMOTION_TAG_MAX_WAIT = 40;

function processStreamEvent(
  delta: string,
  state: StreamState,
  onChunk?: (text: string) => void,
  onSentence?: (sentence: string, emotion: EmotionType) => void
): void {
  state.fullText += delta;

  // Parse emotion from beginning of response
  if (!state.emotionParsed) {
    state.pendingText += delta;
    
    // Check if we have the complete emotion tag
    if (state.fullText.includes("]")) {
      const parsed = parseEmotionAndText(state.fullText);
      state.detectedEmotion = parsed.emotion;
      state.emotionParsed = true;
      state.sentenceBuffer = parsed.text;
      
      // Send the clean text (without emotion tag) to frontend
      if (onChunk && parsed.text.length > 0) {
        onChunk(removeExcessiveEmojis(parsed.text));
      }
      state.pendingText = "";
    } 
    // FALLBACK: If we've received enough text without finding emotion tag,
    // assume there's no tag and start streaming immediately
    else if (state.pendingText.length > EMOTION_TAG_MAX_WAIT || 
             !state.fullText.startsWith("[")) {
      log.debug("No emotion tag detected, using fallback (neutral)");
      state.detectedEmotion = "neutral";
      state.emotionParsed = true;
      state.sentenceBuffer = state.pendingText;
      
      // Send all buffered text to frontend
      if (onChunk && state.pendingText.length > 0) {
        onChunk(removeExcessiveEmojis(state.pendingText));
      }
      state.pendingText = "";
    }
    // Don't send anything until emotion tag is complete (saves bandwidth)
  } else {
    // Emotion already parsed - send delta directly (it's clean text)
    if (onChunk) onChunk(removeExcessiveEmojis(delta));
    state.sentenceBuffer += delta;
  }

  // Emit complete sentences for parallel TTS
  if (onSentence && state.emotionParsed) {
    for (const { sentence, remaining } of extractCompleteSentences(state.sentenceBuffer)) {
      // Filter emojis before TTS to avoid reading emoji descriptions
      const cleanSentence = removeExcessiveEmojis(sentence);
      onSentence(cleanSentence, state.detectedEmotion);
      state.sentenceBuffer = remaining;
    }
  }
}

function finalizeStream(
  state: StreamState,
  onSentence?: (sentence: string, emotion: EmotionType) => void
): { fullText: string; emotion: EmotionType } {
  // Only emit remaining buffer to TTS if it's a complete sentence.
  // When max_tokens cuts off mid-sentence, the trailing fragment
  // (e.g. "家族で一緒に見るのが") would produce meaningless TTS audio.
  const remaining = state.sentenceBuffer.trim();
  if (onSentence && remaining.length > 0) {
    if (/[。！？!?]$/.test(remaining)) {
      onSentence(removeExcessiveEmojis(remaining), state.detectedEmotion);
    } else {
      log.debug(`Dropping incomplete trailing text for TTS: "${remaining.slice(-40)}"`);
    }
  }

  const { emotion, text } = parseEmotionAndText(state.fullText);
  // Trim to last complete sentence so chat display is also clean
  const trimmedText = trimToCompleteSentence(text);
  return { fullText: trimmedText, emotion };
}

/**
 * Chat with Claude - optimized for performance
 * Now supports sentence-level streaming for parallel TTS
 *
 * @param onMovieSearch - Callback that receives search params and returns formatted results string
 *                        The string is passed directly to the LLM as tool result content
 */
export async function chat(
  history: ConversationTurn[],
  userMessage: string,
  onMovieSearch?: (query: string, genre?: string, year?: number) => Promise<string>,
  onChunk?: (text: string) => void,
  onSentence?: (sentence: string, emotion: EmotionType) => void,
  onToolUse?: () => void  // Called when tool_use is detected (before DB search)
): Promise<ChatResponse> {
  const messages = [
    ...toClaudeMessages(history),
    { role: "user" as const, content: userMessage },
  ];

  // Check for instant responses first (no API call, ~0ms)
  if (history.length === 0 || history.length === 1) {
    const instant = getInstantResponse(userMessage);
    if (instant) {
      log.debug("Instant response (no API call)");
      if (onChunk) onChunk(removeExcessiveEmojis(instant.text));
      if (onSentence) onSentence(removeExcessiveEmojis(instant.text), instant.emotion);
      return instant;
    }
  }

  const useTools = needsMovieSearch(userMessage);
  const cacheKey = useTools ? null : getCacheKey(history, userMessage);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    if (onChunk) onChunk(removeExcessiveEmojis(cached.text));
    if (onSentence) onSentence(removeExcessiveEmojis(cached.text), cached.emotion);
    return cached;
  }

  try {
    // Non-tool streaming path
    if (!useTools && onChunk) {
      const stream = await anthropic.messages.stream({
        // model: "claude-sonnet-4-20250514",
        model: "claude-3-5-haiku-20241022",
        max_tokens: MAX_TOKENS_DEFAULT,
        system: SYSTEM_PROMPT,
        stop_sequences: STOP_SEQUENCES,
        messages,
      });

      const state: StreamState = {
        fullText: "",
        sentenceBuffer: "",
        detectedEmotion: "neutral",
        emotionParsed: false,
        pendingText: "",
      };

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          processStreamEvent(event.delta.text, state, onChunk, onSentence);
        }
      }

      const { fullText, emotion } = finalizeStream(state, onSentence);
      const result = { text: fullText, emotion, usedTool: false };
      setCachedResponse(cacheKey, result);
      return result;
    }

    const response = await anthropic.messages.create({
      // model: "claude-sonnet-4-20250514",
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
        // Notify that tool use is starting (for waiting signal)
        if (onToolUse) {
          onToolUse();
        }
        
        const input = toolUseBlock.input as { query: string; genre?: string; year?: number };
        // onMovieSearch now returns formatted string (combined DB + Google results)
        const searchResultContent = await onMovieSearch(input.query, input.genre, input.year);

        // Use streaming for follow-up response to enable parallel TTS
        if (onChunk || onSentence) {
          const followUpStream = await anthropic.messages.stream({
            // model: "claude-sonnet-4-20250514",
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
                    content: searchResultContent,
                  },
                ],
              },
            ],
          });

          const state: StreamState = {
            fullText: "",
            sentenceBuffer: "",
            detectedEmotion: "neutral",
            emotionParsed: false,
            pendingText: "",
          };

          for await (const event of followUpStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              processStreamEvent(event.delta.text, state, onChunk, onSentence);
            }
          }

          const { fullText, emotion } = finalizeStream(state, onSentence);
          return { text: fullText, emotion, usedTool: true };
        }

        // Non-streaming fallback
        const followUpResponse = await anthropic.messages.create({
          // model: "claude-sonnet-4-20250514",
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
                  content: searchResultContent,
                },
              ],
            },
          ],
        });

        const textContent = followUpResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");

        const { emotion, text: rawText } = parseEmotionAndText(textContent);
        return { text: trimToCompleteSentence(rawText), emotion, usedTool: true };
      }
    }

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const { emotion, text: rawText } = parseEmotionAndText(textContent);
    const result = { text: trimToCompleteSentence(rawText), emotion, usedTool: false };
    setCachedResponse(cacheKey, result);
    return result;
  } catch (error) {
    log.error("Claude API error:", error);
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
