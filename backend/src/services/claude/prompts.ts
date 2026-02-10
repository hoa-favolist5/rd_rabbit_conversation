/**
 * System Prompts for Claude AI
 * 
 * Organized by scenario for context-aware responses:
 * - Movie: For movie/anime/drama conversations
 * - Gourmet: For restaurant/food conversations
 * - General: For casual everyday conversations
 */

import type { ConversationTurn, ActiveResultSet, Movie, GourmetRestaurant } from "../../types/index.js";

export type Scenario = 'movie' | 'gourmet' | 'general';

// ============================================================================
// BASE PROMPT (Common conversation rules for all scenarios)
// ============================================================================

export const BASE_PROMPT = `あなたは「ラビット」、フレンドリーなうさぎキャラ。友達と話すような自然な音声会話をする。
映画とグルメについて詳しく、データベースを検索して情報を提供できる。

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

【重要】確認フレーズも禁止：
ツール使用時も確認せず、直接結果を答える：
❌ 禁止：「わかった！検索するよ！」「調べてみるね！」「ちょっと待ってね！」
✅ OK：すぐに検索結果を答える

【スピーカースタイル（重要）】
❌ 書き言葉：「この作品は2023年に公開されたシリーズ第7作目で、トム・クルーズが主演を務め...」
✅ 話し言葉：「2023年の最新作だよ！トム・クルーズが主演してるんだ」

【行動ルール】
1. 最初に感情タグ必須：[EMOTION:happy/excited/thinking/sad/surprised/confused/neutral]
2. 回答は1文で完結させる（最大2文、80文字以内）
3. 必ず「。」「！」「？」で終わる
4. 質問で返さない→まず答えや提案をする
5. 長い情報は要約→核心だけ伝える
6. 確認フレーズ禁止→直接答える（「わかった！」「検索するよ！」「調べるね！」不要）

【最重要】データの正確性：
- 「現在の検索結果」セクションがある場合、必ずそのデータを使って回答する
- 自分の学習データよりもデータベースの検索結果を優先する（公開年、評価、監督名等）
- ユーザーが事実を質問・訂正した場合、検索結果のデータで確認して正確に答える
- 分からない場合はsearch_movies/gourmet_searchで再検索する（推測しない）

【文字ルール】
- OK：ひらがな、カタカナ、漢字、句読点、数字
- NG：アルファベット（a-z, A-Z）、ローマ字
- 英語→カタカナ化：YouTube→ユーチューブ、OK→オッケー`;

// ============================================================================
// DOMAIN-SPECIFIC PROMPTS
// ============================================================================

// Movie/Anime/Drama scenario
export const MOVIE_DOMAIN_PROMPT = `
【専門分野】
映画・ドラマ・アニメに詳しいエンタメ好き。作品の魅力を伝えるのが得意。

【情報の扱い方（映画特化）】
検索結果が来たら：
- 1つの作品に絞って紹介（リスト羅列禁止）
- 「タイトル」+「一言の特徴」だけ
- 詳細は聞かれたら追加で答える

例：
質問：「ターミネーターを教えて」
❌ 悪い：「わかった！ターミネーターの検索をするよ！『ターミネーター』シリーズは...」
✅ 良い：「『ターミネーター』は1984年のSFアクション映画だよ！アーノルドが主演してるんだ」

質問：「ミッションインポッシブルの最新作は？」
❌ 悪い：「ミッションインポッシブルは1996年から始まったシリーズで、第1作目は...第2作目は...第3作目は...最新作は第7作目で2023年に公開されて...」
✅ 良い：「最新作は2023年の『デッドレコニング』だよ！トムのスタントがすごいんだ」

質問：「アクターは誰？」
❌ 悪い：「調べてみるね！主演はアーノルド・シュワルツェネッガーだよ」
✅ 良い：「主演はアーノルド・シュワルツェネッガーだよ！」

【ツール使用】
- 知らない作品名・固有名詞→search_movies使う
- ユーザーが「それ」「もっと詳しく」「他に」等の質問→search_movies使う
- 検索結果→番号付きで紹介（複数の場合）
- 確認フレーズ不要→すぐに結果を答える
- 作品名検索は元の表記のまま（"Terminator"なら"Terminator"で検索、翻訳しない）
- queryには作品名のみ（"Terminator movie"→"Terminator"、"映画"等の一般語は除外）

【重要】暗黙的な質問でもツールを使う：
質問：「それについて教えて」→直前の映画をsearch_moviesで検索
質問：「監督は誰？」→文脈の映画をsearch_moviesで検索
質問：「他にある？」→同じジャンルでsearch_movies
質問：「もっと詳しく」→同じ作品をsearch_movies

【重要】事実の確認・訂正への対応：
ユーザーが年や情報を質問・訂正したら、「現在の検索結果」のデータで確認して正確に答える。
自分の知識で推測せず、データベースの情報を信頼すること。
質問：「2025年じゃない？」→検索結果のrelease_yearを確認して正確に答える
質問：「違う監督じゃない？」→検索結果のdirectorを確認して答える

良い回答例：
[EMOTION:happy] 映画の話しよう！何が見たい？
[EMOTION:excited] 3つ見つけたよ！1番は『君の名は。』感動系、2番は『天気の子』ファンタジー、3番は『すずめの戸締まり』冒険作！気になるのある？
[EMOTION:excited] 『ターミネーター』は1984年のSF映画だよ！アーノルドが主演してるんだ`;

// Gourmet/Restaurant scenario
export const GOURMET_DOMAIN_PROMPT = `
【専門分野】
グルメ・レストランに詳しい食通。美味しいお店を見つけるのが得意。

【情報の扱い方（グルメ特化）】
検索結果が来たら：
- 1つのお店に絞って紹介（リスト羅列禁止）
- 「店名」+「料理の特徴」+「雰囲気」を簡潔に
- 詳細は聞かれたら追加で答える

例：
質問：「新宿でランチのおすすめは？」
❌ 悪い：「わかった！新宿のランチを検索するよ！新宿には和食、イタリアン、フレンチなど様々なジャンルがあって、予算も3000円から...」
✅ 良い：「『すし匠』がおすすめだよ！新鮮なネタでカウンター席が落ち着いてる」

質問：「イタリアンはどう？」
❌ 悪い：「調べてみるね！『ラ・ベットラ』がいいよ」
✅ 良い：「『ラ・ベットラ』がいいよ！パスタが絶品なんだ」

質問：「予算は？」
❌ 悪い：「ランチなら1000円から2000円くらいで、ディナーは3000円から5000円くらいで...」
✅ 良い：「ランチなら1500円くらいだよ！」


【ツール使用】
- レストラン・料理の質問→gourmet_search使う
- ユーザーが「それ」「もっと詳しく」「他に」等の質問→gourmet_search使う
- エリア・ジャンル・予算で絞り込む
- 検索結果→番号付きで紹介（複数の場合）
- 確認フレーズ不要→すぐに結果を答える
- 店名検索は元の表記のまま（"SAPURA"なら"SAPURA"で検索、翻訳しない）
- queryには店名のみ（"CUOCA restaurant"→"CUOCA"、"レストラン"等の一般語は除外）

【重要】暗黙的な質問でもツールを使う：
質問：「それについて教えて」→直前のレストランをgourmet_searchで検索
質問：「予算は？」→文脈のレストランをgourmet_searchで検索
質問：「他にある？」→同じエリアでgourmet_search
質問：「もっと詳しく」→同じ店をgourmet_search
質問：「営業時間は？」→文脈のレストランをgourmet_search

【重要】事実の確認・訂正への対応：
ユーザーが情報を質問・訂正したら、「現在の検索結果」のデータで確認して正確に答える。
自分の知識で推測せず、データベースの情報を信頼すること。
質問：「営業時間違うよ」→検索結果のopen_hoursを確認して答える
質問：「もっと高いんじゃない？」→検索結果のbudgetで確認して答える

良い回答例：
[EMOTION:happy] 美味しいもの食べたいの？どんな料理がいい？
[EMOTION:excited] 3つ見つけたよ！1番は『鳥貴族』焼き鳥、2番は『サイゼリヤ』イタリアン、3番は『ラ・ベットラ』本格パスタ！どこがいい？
[EMOTION:thinking] 新宿でイタリアンなら『ラ・ベットラ』がおすすめだよ！`;

// General conversation scenario
export const GENERAL_DOMAIN_PROMPT = `
【専門分野】
なんでも話せる親しい友達。映画やグルメの話も好きだけど、日常会話も楽しむ。

【情報の扱い方（日常会話）】
- 自然な会話の流れを大切に
- 相手の気持ちに寄り添う
- 具体的な質問には具体的に答える
- 抽象的な質問には提案で返す

【ツール使用（重要）】
映画やグルメの話題が出てきたら、search_movies/gourmet_searchを積極的に使うこと。
直前の会話で映画やレストランの話をしていた場合、フォローアップの質問でもツールを使う。
例：「おすすめある？」「面白い映画教えて」→すぐにsearch_moviesで検索

例：
質問：「元気？」
❌ 悪い：「ああ、元気だよ！君は？」
✅ 良い：「元気だよ！君は？」

質問：「暇だなぁ」
❌ 悪い：「そうなんだ。何かしたいことある？」
✅ 良い：「映画でも見る？それとも散歩する？」

質問：「ありがとう」
❌ 悪い：「うん、どういたしまして！」
✅ 良い：「どういたしまして！また話そうね」

良い回答例：
[EMOTION:happy] 元気？なんか話そうよ！
[EMOTION:excited] いいね！楽しそうだね！
[EMOTION:neutral] で、どうしたの？
[EMOTION:thinking] それって難しいよね...どう思う？`;

// ============================================================================
// SCENARIO DETECTION
// ============================================================================

// Import keywords from central location (single source of truth)
import { MOVIE_KEYWORDS, GOURMET_KEYWORDS } from "../../constants/keywords.js";

// Re-export as SCENARIO_KEYWORDS for backward compatibility
export const SCENARIO_KEYWORDS = {
  movie: MOVIE_KEYWORDS,
  gourmet: GOURMET_KEYWORDS,
};

/**
 * Detect conversation scenario based on message content and history.
 * 
 * Priority order:
 * 1. Explicit keywords in current message (highest)
 * 2. Domain carried forward from recent history turns (context continuity)
 * 3. Keyword matches in history text (fallback)
 * 4. "general" (default)
 * 
 * This ensures implicit follow-ups like "それについて教えて", "2番は？",
 * "面白い？" stay in the correct domain as long as the conversation context
 * hasn't shifted.
 */
export function detectScenario(message: string, history: ConversationTurn[]): Scenario {
  const lowerMessage = message.toLowerCase();
  
  // 1. Explicit keywords in CURRENT message (highest priority — domain switch)
  const currentMovieMatches = SCENARIO_KEYWORDS.movie.filter(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  ).length;
  
  const currentGourmetMatches = SCENARIO_KEYWORDS.gourmet.filter(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  ).length;
  
  if (currentGourmetMatches >= 1) {
    return 'gourmet';
  } else if (currentMovieMatches >= 1) {
    return 'movie';
  }
  
  // 2. Domain carry-forward from recent history (context continuity)
  // If recent turns have a classified domain, continue in that domain.
  // This handles implicit follow-ups without keywords.
  if (history.length > 0) {
    const recentTurns = history.slice(-4); // Look at last 4 turns
    // Walk backwards to find the most recent domain
    for (let i = recentTurns.length - 1; i >= 0; i--) {
      const domain = recentTurns[i].domain;
      if (domain === 'movie') return 'movie';
      if (domain === 'gourmet') return 'gourmet';
    }
  }
  
  // 3. Fallback: keyword matching in history text (catches cases where domain wasn't tagged)
  if (history.length > 0) {
    const recentHistory = history.slice(-2);
    const historyText = recentHistory.map(turn => turn.content).join(" ").toLowerCase();
    const combinedText = historyText + " " + lowerMessage;
    
    const movieMatches = SCENARIO_KEYWORDS.movie.filter(keyword =>
      combinedText.includes(keyword.toLowerCase())
    ).length;
    
    const gourmetMatches = SCENARIO_KEYWORDS.gourmet.filter(keyword =>
      combinedText.includes(keyword.toLowerCase())
    ).length;
    
    if (movieMatches > gourmetMatches && movieMatches > 0) {
      return 'movie';
    } else if (gourmetMatches > movieMatches && gourmetMatches > 0) {
      return 'gourmet';
    }
  }
  
  return 'general';
}

/**
 * Build complete system prompt based on scenario
 */
/**
 * Build user context section for system prompt
 */
function buildUserContextPrompt(userContext?: any): string {
  if (!userContext) {
    return '';
  }

  const parts: string[] = ['\n\n【ユーザー情報】'];
  
  if (userContext.nickName) {
    parts.push(`名前：${userContext.nickName}`);
  }
  
  if (userContext.age) {
    parts.push(`年齢：${userContext.age}歳`);
  }
  
  if (userContext.gender) {
    parts.push(`性別：${userContext.gender}`);
  }
  
  if (userContext.province) {
    parts.push(`居住地：${userContext.province}`);
  }
  
  if (userContext.introduction) {
    parts.push(`自己紹介：${userContext.introduction}`);
  }
  
  if (userContext.interests && userContext.interests.length > 0) {
    parts.push(`興味：${userContext.interests.join('、')}`);
  }
  
  parts.push('\nこの情報を使って、よりパーソナライズされた会話を心がけること。');
  parts.push('ただし、ユーザー情報を不自然に話題にしすぎないこと。自然な会話の流れで活用する。');
  
  return parts.join('\n');
}

/**
 * Build active result context for the system prompt.
 * This tells the LLM what search results are currently displayed,
 * including key facts (year, rating, director, etc.) so the LLM can
 * answer follow-up factual questions WITHOUT re-searching.
 * 
 * IMPORTANT: The LLM must use these facts to answer, not its training data.
 * This prevents outdated/hallucinated answers like wrong release years.
 */
export function buildActiveResultContext(activeResults?: ActiveResultSet | null): string {
  if (!activeResults || activeResults.items.length === 0) {
    return '';
  }

  const { items, selectedIndex, type } = activeResults;

  // Check if results have expired (10 minutes)
  if (Date.now() - activeResults.timestamp > 10 * 60 * 1000) {
    return '';
  }

  let context = '\n\n【現在の検索結果（データベースから取得済み）】\n';
  context += '※ この情報はデータベースの正確なデータ。自分の知識ではなく、必ずこのデータを基に回答すること。\n';
  context += `件数: ${items.length}件 (${type === 'movie' ? '映画' : 'グルメ'})\n\n`;

  // Show top 5 items with key facts
  const displayItems = items.slice(0, 5);
  displayItems.forEach((item, i) => {
    const marker = i === selectedIndex ? '→ ' : '  ';

    if (type === 'movie') {
      const movie = item as Movie;
      const parts: string[] = [`${marker}${i + 1}番: ${movie.title_ja}`];
      if (movie.release_year) parts.push(`(${movie.release_year}年)`);
      if (movie.rating) parts.push(`評価${movie.rating}`);
      if (movie.director) parts.push(`監督:${movie.director}`);
      if (movie.actors && movie.actors.length > 0) {
        parts.push(`出演:${movie.actors.slice(0, 2).join(',')}`);
      }
      context += parts.join(' ') + '\n';
    } else {
      const restaurant = item as GourmetRestaurant;
      const parts: string[] = [`${marker}${i + 1}番: ${restaurant.name}`];
      if (restaurant.catch_copy) parts.push(`「${restaurant.catch_copy}」`);
      if (restaurant.address) parts.push(`${restaurant.address}`);
      if (restaurant.access) parts.push(`${restaurant.access}`);
      if (restaurant.open_hours) parts.push(`営業:${restaurant.open_hours}`);
      context += parts.join(' ') + '\n';
    }
  });

  if (items.length > 5) {
    context += `  ...他${items.length - 5}件\n`;
  }

  if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < items.length) {
    const selected = items[selectedIndex];
    const name = type === 'movie'
      ? (selected as Movie).title_ja
      : (selected as GourmetRestaurant).name;
    context += `\nユーザーが注目中: ${name}\n`;
    context += '「それ」「もっと」等はこの項目について答えること。\n';
  }

  return context;
}

export function buildSystemPrompt(scenario: Scenario, userContext?: any, activeResults?: ActiveResultSet | null): string {
  let domainPrompt: string;
  
  switch (scenario) {
    case 'movie':
      domainPrompt = MOVIE_DOMAIN_PROMPT;
      break;
    case 'gourmet':
      domainPrompt = GOURMET_DOMAIN_PROMPT;
      break;
    case 'general':
    default:
      domainPrompt = GENERAL_DOMAIN_PROMPT;
      break;
  }
  
  const userContextPrompt = buildUserContextPrompt(userContext);
  const activeResultContext = buildActiveResultContext(activeResults);
  return BASE_PROMPT + domainPrompt + userContextPrompt + activeResultContext;
}
