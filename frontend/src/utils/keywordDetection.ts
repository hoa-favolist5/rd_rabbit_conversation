/**
 * Keyword detection utility for determining if user message requires database operations
 * (movie search, gourmet search, etc.)
 * 
 * If keywords are detected, waiting phrases should be played.
 * If no keywords (traditional conversation), skip waiting phrases.
 */

// Movie-related keywords (synced with backend MOVIE_KEYWORDS)
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

// Gourmet-related keywords (add as needed)
const GOURMET_KEYWORDS = [
  "レストラン", "飲食店", "食事", "ランチ", "ディナー", "カフェ",
  "居酒屋", "焼肉", "寿司", "ラーメン", "イタリアン", "フレンチ",
  "中華", "和食", "洋食", "料理", "グルメ", "美味しい", "食べたい",
  "予約", "お店", "店", "メニュー", "おすすめ", "人気"
];

/**
 * Check if text contains movie or gourmet keywords
 * @param text User message text
 * @returns true if keywords detected (should play waiting phrase), false otherwise
 */
export function shouldPlayWaitingPhrase(text: string): boolean {
  const normalizedText = text.toLowerCase();
  
  // Check movie keywords
  const hasMovieKeyword = MOVIE_KEYWORDS.some(keyword => 
    normalizedText.includes(keyword.toLowerCase())
  );
  
  // Check gourmet keywords
  const hasGourmetKeyword = GOURMET_KEYWORDS.some(keyword =>
    normalizedText.includes(keyword.toLowerCase())
  );
  
  return hasMovieKeyword || hasGourmetKeyword;
}
