/**
 * Keyword detection for movie/gourmet queries.
 * 
 * Determines if user message requires:
 * 1. Database operations (movie/restaurant search)
 * 2. Waiting phrase playback
 * 3. Hiragana conversion for better matching
 */

// Core keywords that trigger DB operations
// Kept minimal - backend has full list with hiragana variants
const MOVIE_KEYWORDS = [
  // Core terms
  "映画", "アニメ", "ドラマ", "ムービー", "作品",
  // People
  "監督", "俳優", "女優", "声優",
  // Genres
  "ホラー", "コメディ", "アクション", "ロマンス", "ファンタジー", "ミステリー",
  // Studios
  "ジブリ", "ピクサー", "ディズニー", "マーベル",
  // Famous works
  "千と千尋", "君の名は", "トトロ", "鬼滅", "ワンピース",
  // Actions
  "見たい", "観たい", "おすすめ",
];

const GOURMET_KEYWORDS = [
  // Core terms
  "レストラン", "カフェ", "居酒屋", "料理", "グルメ",
  // Meals
  "ランチ", "ディナー", "食事",
  // Types
  "寿司", "ラーメン", "焼肉", "イタリアン", "フレンチ", "中華", "和食",
  // Actions
  "食べたい", "美味しい", "予約", "おすすめ",
];

const ALL_KEYWORDS = [...MOVIE_KEYWORDS, ...GOURMET_KEYWORDS];

/**
 * Check if text contains keywords that trigger DB operations.
 * Used to decide whether to:
 * - Play waiting phrase
 * - Convert to hiragana before sending to backend
 */
export function shouldPlayWaitingPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return ALL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Alias for clarity in different contexts
 */
export const hasDbKeywords = shouldPlayWaitingPhrase;
