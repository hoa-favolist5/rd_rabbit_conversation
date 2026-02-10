import type { EmotionType } from "../types/index.js";

/**
 * Emotion detection and mapping utilities
 */

// Japanese emotion keywords for detection
const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
  happy: [
    "嬉しい", "楽しい", "幸せ", "喜び", "素敵", "いいね", "良い", "最高",
    "ありがとう", "感謝", "素晴らしい", "うれしい", "たのしい"
  ],
  excited: [
    "ワクワク", "興奮", "すごい", "やった", "わーい", "やばい", "最高",
    "びっくり", "面白い", "おもしろい"
  ],
  sad: [
    "悲しい", "寂しい", "つらい", "残念", "かなしい", "さみしい",
    "切ない", "泣く", "涙", "悔しい"
  ],
  surprised: [
    "驚き", "びっくり", "まさか", "えっ", "おどろき", "意外", "本当"
  ],
  thinking: [
    "考える", "思う", "かもしれない", "たぶん", "おそらく", "どうかな",
    "難しい", "むずかしい", "分からない", "わからない"
  ],
  confused: [
    "困る", "こまる", "よくわからない", "どうすれば", "えーと",
    "うーん", "はて", "困惑"
  ],
  neutral: [],
  listening: [],
  speaking: [],
};

/**
 * Detect emotion from text content
 * Returns the most likely emotion based on keyword matching
 */
export function detectEmotion(text: string): EmotionType {
  const lowerText = text.toLowerCase();
  
  // Count matches for each emotion
  const scores: Record<EmotionType, number> = {
    happy: 0,
    excited: 0,
    sad: 0,
    surprised: 0,
    thinking: 0,
    confused: 0,
    neutral: 0,
    listening: 0,
    speaking: 0,
  };

  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        scores[emotion as EmotionType]++;
      }
    }
  }

  // Find emotion with highest score
  let maxScore = 0;
  let detectedEmotion: EmotionType = "neutral";

  for (const [emotion, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedEmotion = emotion as EmotionType;
    }
  }

  return detectedEmotion;
}

/**
 * Get emotion intensity (0.0 - 1.0) based on text analysis
 */
export function getEmotionIntensity(text: string, emotion: EmotionType): number {
  const keywords = EMOTION_KEYWORDS[emotion];
  if (!keywords || keywords.length === 0) return 0.5;

  let matchCount = 0;
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  // Normalize to 0.5 - 1.0 range
  return Math.min(0.5 + (matchCount * 0.1), 1.0);
}

/**
 * Emotion display data
 */
export const EMOTION_DISPLAY: Record<
  EmotionType,
  { face: string; label: string; color: string }
> = {
  neutral: { face: "(・ω・)", label: "普通", color: "#6B7280" },
  happy: { face: "(◕‿◕)", label: "嬉しい", color: "#F59E0B" },
  excited: { face: "(★▽★)", label: "ワクワク", color: "#EF4444" },
  thinking: { face: "(・_・?)", label: "考え中", color: "#06B6D4" },
  sad: { face: "(´・ω・`)", label: "悲しい", color: "#6B7280" },
  surprised: { face: "(°o°)", label: "驚き", color: "#F59E0B" },
  confused: { face: "(・・?)", label: "困惑", color: "#8B5CF6" },
  listening: { face: "(・ω・)🎤", label: "聞いています", color: "#10B981" },
  speaking: { face: "(・ω・)♪", label: "話しています", color: "#3B82F6" },
};
