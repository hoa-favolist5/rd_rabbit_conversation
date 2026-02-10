/**
 * Cross-Language Search Utility
 *
 * Provides English ↔ Japanese (Katakana) mappings for movie search
 * Enables users to search in either language and find matches in the other
 */

// English-to-Katakana mapping for common movie-related words
const ENGLISH_TO_KATAKANA: Map<string, string[]> = new Map([
  // === Popular Movie Titles ===
  ["matrix", ["マトリックス"]],
  ["terminator", ["ターミネーター"]],
  ["avatar", ["アバター"]],
  ["inception", ["インセプション"]],
  ["interstellar", ["インターステラー"]],
  ["titanic", ["タイタニック"]],
  ["joker", ["ジョーカー"]],
  ["gladiator", ["グラディエーター"]],

  // === Marvel/DC ===
  ["avengers", ["アベンジャーズ"]],
  ["spider", ["スパイダー"]],
  ["spiderman", ["スパイダーマン"]],
  ["batman", ["バットマン"]],
  ["superman", ["スーパーマン"]],
  ["ironman", ["アイアンマン"]],
  ["hulk", ["ハルク"]],
  ["thor", ["ソー"]],
  ["deadpool", ["デッドプール"]],
  ["venom", ["ヴェノム"]],
  ["aquaman", ["アクアマン"]],
  ["wolverine", ["ウルヴァリン"]],
  ["x-men", ["エックスメン"]],
  ["xmen", ["エックスメン"]],

  // === Star Wars ===
  ["star", ["スター"]],
  ["wars", ["ウォーズ"]],
  ["starwars", ["スターウォーズ"]],
  ["jedi", ["ジェダイ"]],
  ["skywalker", ["スカイウォーカー"]],

  // === Harry Potter ===
  ["harry", ["ハリー"]],
  ["potter", ["ポッター"]],
  ["hogwarts", ["ホグワーツ"]],

  // === Lord of the Rings ===
  ["lord", ["ロード"]],
  ["rings", ["リング", "リングス"]],
  ["hobbit", ["ホビット"]],

  // === Disney/Pixar ===
  ["frozen", ["フローズン", "アナと雪の女王"]],
  ["elsa", ["エルサ"]],
  ["moana", ["モアナ"]],
  ["toy", ["トイ"]],
  ["story", ["ストーリー"]],
  ["finding", ["ファインディング"]],
  ["nemo", ["ニモ"]],
  ["dory", ["ドリー"]],
  ["coco", ["リメンバーミー", "ココ"]],
  ["ratatouille", ["レミーのおいしいレストラン", "ラタトゥイユ"]],
  ["incredibles", ["インクレディブル"]],
  ["monsters", ["モンスターズ"]],
  ["cars", ["カーズ"]],
  ["wall-e", ["ウォーリー"]],

  // === Animation ===
  ["shrek", ["シュレック"]],
  ["minions", ["ミニオン", "ミニオンズ"]],
  ["despicable", ["怪盗グルー"]],
  ["kung", ["カンフー"]],
  ["panda", ["パンダ"]],
  ["dreamworks", ["ドリームワークス"]],

  // === Action/Adventure ===
  ["mission", ["ミッション"]],
  ["impossible", ["インポッシブル"]],
  ["fast", ["ワイルド", "ファスト"]],
  ["furious", ["スピード", "フューリアス"]],
  ["jurassic", ["ジュラシック"]],
  ["park", ["パーク"]],
  ["world", ["ワールド"]],
  ["pirates", ["パイレーツ"]],
  ["caribbean", ["カリビアン"]],
  ["transformers", ["トランスフォーマー"]],
  ["godzilla", ["ゴジラ"]],
  ["kong", ["コング"]],
  ["king", ["キング"]],
  ["john", ["ジョン"]],
  ["wick", ["ウィック"]],
  ["bond", ["ボンド"]],
  ["james", ["ジェームズ"]],

  // === Horror ===
  ["conjuring", ["死霊館"]],
  ["annabelle", ["アナベル"]],
  ["it", ["イット"]],
  ["nightmare", ["ナイトメア"]],
  ["halloween", ["ハロウィン"]],
  ["scream", ["スクリーム"]],
  ["saw", ["ソウ"]],

  // === Sci-Fi ===
  ["alien", ["エイリアン"]],
  ["predator", ["プレデター"]],
  ["blade", ["ブレード"]],
  ["runner", ["ランナー"]],
  ["terminator", ["ターミネーター"]],
  ["robocop", ["ロボコップ"]],
  ["back", ["バック"]],
  ["future", ["フューチャー"]],
  ["trek", ["トレック"]],

  // === Romance/Drama ===
  ["titanic", ["タイタニック"]],
  ["notebook", ["きみに読む物語", "ノートブック"]],
  ["la", ["ラ"]],
  ["land", ["ランド"]],

  // === Common Words ===
  ["man", ["マン"]],
  ["woman", ["ウーマン"]],
  ["the", ["ザ"]],
  ["of", ["オブ"]],
  ["and", ["アンド"]],
  ["love", ["ラブ"]],
  ["war", ["ウォー"]],
  ["queen", ["クイーン"]],
  ["prince", ["プリンス"]],
  ["princess", ["プリンセス"]],
  ["dragon", ["ドラゴン"]],
  ["knight", ["ナイト"]],
  ["night", ["ナイト"]],
  ["dark", ["ダーク"]],
  ["light", ["ライト"]],
  ["shadow", ["シャドウ"]],
  ["ghost", ["ゴースト"]],
  ["spirit", ["スピリット"]],
  ["soul", ["ソウル"]],
  ["hero", ["ヒーロー"]],
  ["super", ["スーパー"]],
  ["power", ["パワー"]],
  ["rangers", ["レンジャー"]],
  ["team", ["チーム"]],
  ["squad", ["スクワッド"]],
  ["league", ["リーグ"]],
  ["justice", ["ジャスティス"]],
  ["captain", ["キャプテン"]],
  ["america", ["アメリカ"]],
  ["wonder", ["ワンダー"]],
  ["black", ["ブラック"]],
  ["white", ["ホワイト"]],
  ["red", ["レッド"]],
  ["blue", ["ブルー"]],
  ["green", ["グリーン"]],
  ["golden", ["ゴールデン"]],
  ["silver", ["シルバー"]],
  ["iron", ["アイアン"]],
  ["steel", ["スティール"]],
  ["doctor", ["ドクター"]],
  ["strange", ["ストレンジ"]],
  ["ant", ["アント"]],
  ["wasp", ["ワスプ"]],
  ["panther", ["パンサー"]],
  ["widow", ["ウィドウ"]],
  ["arrow", ["アロー"]],
  ["flash", ["フラッシュ"]],
  ["winter", ["ウィンター"]],
  ["soldier", ["ソルジャー"]],
  ["civil", ["シビル"]],
  ["infinity", ["インフィニティ"]],
  ["end", ["エンド"]],
  ["game", ["ゲーム"]],
  ["home", ["ホーム"]],
  ["coming", ["カミング"]],
  ["far", ["ファー"]],
  ["from", ["フロム"]],
  ["no", ["ノー"]],
  ["way", ["ウェイ"]],
]);

// Build reverse mapping: Katakana to English
const KATAKANA_TO_ENGLISH: Map<string, string[]> = new Map();

// Populate reverse mapping from ENGLISH_TO_KATAKANA
for (const [english, katakanaList] of ENGLISH_TO_KATAKANA.entries()) {
  for (const katakana of katakanaList) {
    const existing = KATAKANA_TO_ENGLISH.get(katakana) || [];
    if (!existing.includes(english)) {
      existing.push(english);
    }
    KATAKANA_TO_ENGLISH.set(katakana, existing);
  }
}

// Add additional Katakana-only entries (Japanese titles that don't have direct English word mapping)
const ADDITIONAL_KATAKANA_TO_ENGLISH: [string, string[]][] = [
  ["マトリックス", ["matrix", "the matrix"]],
  ["アベンジャーズ", ["avengers", "the avengers"]],
  ["スパイダーマン", ["spiderman", "spider-man", "spider man"]],
  ["スターウォーズ", ["starwars", "star wars"]],
  ["ハリーポッター", ["harry potter"]],
  ["ロードオブザリング", ["lord of the rings"]],
  ["パイレーツオブカリビアン", ["pirates of the caribbean"]],
  ["ミッションインポッシブル", ["mission impossible"]],
  ["ワイルドスピード", ["fast and furious", "fast furious"]],
  ["ジュラシックパーク", ["jurassic park"]],
  ["ジュラシックワールド", ["jurassic world"]],
  ["バックトゥザフューチャー", ["back to the future"]],
  ["ターミネーター", ["terminator", "the terminator"]],
  ["トランスフォーマー", ["transformers"]],
  ["インクレディブル", ["incredibles", "the incredibles"]],
  ["モンスターズインク", ["monsters inc"]],
  ["トイストーリー", ["toy story"]],
  ["ファインディングニモ", ["finding nemo"]],
  ["カーズ", ["cars"]],
  ["シュレック", ["shrek"]],
  ["ミニオンズ", ["minions"]],
  ["怪盗グルー", ["despicable me"]],
];

for (const [katakana, englishList] of ADDITIONAL_KATAKANA_TO_ENGLISH) {
  const existing = KATAKANA_TO_ENGLISH.get(katakana) || [];
  for (const english of englishList) {
    if (!existing.includes(english)) {
      existing.push(english);
    }
  }
  KATAKANA_TO_ENGLISH.set(katakana, existing);
}

/**
 * Check if a string contains English (ASCII letters)
 */
function hasEnglish(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

/**
 * Check if a string contains Japanese characters (Hiragana, Katakana, Kanji)
 */
function hasJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

/**
 * Expand a search query to include cross-language variants
 *
 * @param query Original search query (can be English, Japanese, or mixed)
 * @returns Array of search terms including original and translated variants
 *
 * @example
 * expandSearchQuery("matrix") => ["matrix", "マトリックス"]
 * expandSearchQuery("マトリックス") => ["マトリックス", "matrix", "the matrix"]
 * expandSearchQuery("spider man") => ["spider man", "スパイダー", "マン", "スパイダーマン"]
 */
export function expandSearchQuery(query: string): string[] {
  const terms: Set<string> = new Set();
  const normalizedQuery = query.trim().toLowerCase();

  // Always include the original query
  terms.add(normalizedQuery);

  // Also include original case-preserved for exact matches
  if (query.trim() !== normalizedQuery) {
    terms.add(query.trim());
  }

  const containsEnglish = hasEnglish(query);
  const containsJapanese = hasJapanese(query);

  if (containsEnglish) {
    // Try full phrase match first
    const fullPhraseKatakana = ENGLISH_TO_KATAKANA.get(normalizedQuery.replace(/\s+/g, ""));
    if (fullPhraseKatakana) {
      fullPhraseKatakana.forEach(k => terms.add(k));
    }

    // Also try with spaces removed variations
    const noSpaceQuery = normalizedQuery.replace(/\s+/g, "");
    const withSpaceKatakana = ENGLISH_TO_KATAKANA.get(noSpaceQuery);
    if (withSpaceKatakana) {
      withSpaceKatakana.forEach(k => terms.add(k));
    }

    // Split by spaces and convert each English word to katakana
    const words = normalizedQuery.split(/\s+/);
    for (const word of words) {
      const katakanaVariants = ENGLISH_TO_KATAKANA.get(word);
      if (katakanaVariants) {
        katakanaVariants.forEach(k => terms.add(k));
      }
    }

    // Try combining adjacent words for compound terms
    if (words.length >= 2) {
      for (let i = 0; i < words.length - 1; i++) {
        const compound = words[i] + words[i + 1];
        const compoundKatakana = ENGLISH_TO_KATAKANA.get(compound);
        if (compoundKatakana) {
          compoundKatakana.forEach(k => terms.add(k));
        }
      }
    }
  }

  if (containsJapanese) {
    // Try full phrase match
    const englishVariants = KATAKANA_TO_ENGLISH.get(query.trim());
    if (englishVariants) {
      englishVariants.forEach(e => terms.add(e));
    }

    // Try matching substrings for compound katakana words
    for (const [katakana, englishList] of KATAKANA_TO_ENGLISH.entries()) {
      if (query.includes(katakana)) {
        englishList.forEach(e => terms.add(e));
      }
    }
  }

  // Limit expansion to prevent query bloat (max 10 terms)
  const result = Array.from(terms);
  if (result.length > 10) {
    return result.slice(0, 10);
  }

  return result;
}

/**
 * Get statistics about the mapping tables (for debugging)
 */
export function getMappingStats(): { englishTerms: number; katakanaTerms: number } {
  return {
    englishTerms: ENGLISH_TO_KATAKANA.size,
    katakanaTerms: KATAKANA_TO_ENGLISH.size,
  };
}
