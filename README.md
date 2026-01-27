# 🐰 Rabbit AI Avatar

日本語で会話できるAIライブアバターシステム。テキストベースのアバター表示で感情を表現し、映画情報のデータベース検索にも対応しています。

## ✨ 機能

- **音声入力**: AWS Transcribe Streamingによるリアルタイム音声認識 (フロントエンド直接接続)
- **RNNoise統合**: Mozilla製AIノイズ除去対応 (デフォルトOFF、日本語認識精度優先)
- **バージイン対応**: AIの話し中に割り込んで新しい質問が可能
- **日本語会話**: Claude 3.5 Haikuによる自然な日本語会話
- **感情表現**: Lottieアニメーションで感情を表現
- **音声出力**: Azure Neural TTSによる感情豊かな音声合成
- **映画検索**: データベースから映画情報を検索して回答
- **リアルタイム**: WebSocketによる低遅延通信

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Voice Input      │  │ WebSocket    │  │ Lottie Avatar │ │
│  │ (AWS Transcribe) │  │              │  │ Display       │ │
│  └────────┬─────────┘  └──────────────┘  └───────────────┘ │
│           │                     ▲                            │
│           ▼                     │                            │
│  ┌────────────────────┐         │                           │
│  │ AWS Transcribe     │         │ (Text + Audio only)       │
│  │ Streaming          │         │                           │
│  │ (Frontend Direct)  │         │                           │
│  └────────────────────┘         │                           │
└──────────────────────────────────┼───────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Node.js/Express)                   │
│  ┌─────────────┐  ┌──────────────────────┐                 │
│  │ Claude 3.5  │  │ Azure Neural TTS     │                 │
│  │ Haiku       │→ │ (Nanami/Keita)       │                 │
│  └──────┬──────┘  └──────────────────────┘                 │
│         │                                                    │
│  ┌──────▼───────────┐                                       │
│  │ PostgreSQL       │                                       │
│  │ (Movies DB)      │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

📊 **詳細なワークフロー図は [WORKFLOW.md](./WORKFLOW.md) を参照してください。**

- 全体フロー図（12ステップ）
- シーケンス図
- パフォーマンスタイムライン
- 感情フロー
- 映画検索Tool Useフロー

🔇 **音質改善・ノイズ除去については [RNNOISE_INTEGRATION.md](./RNNOISE_INTEGRATION.md) を参照してください。**

- RNNoise統合の詳細
- オーディオパイプラインの説明
- テスト方法とパフォーマンス
- エコー問題の解決方法
- ⚠️ **日本語認識の最適化**: [RNNOISE_JAPANESE_ISSUE.md](./RNNOISE_JAPANESE_ISSUE.md)
  - RNNoiseはデフォルトOFF (日本語認識精度優先)
  - 必要に応じて有効化可能

🎙️ **バージイン設定については [BARGE_IN_CONFIG.md](./BARGE_IN_CONFIG.md) を参照してください。**

- 最小文字数閾値の設定
- 誤検知防止の仕組み
- 推奨設定値とカスタマイズ方法

## 📋 必要条件

- Node.js 18+
- PostgreSQL 14+ (Docker推奨)
- 以下のAPIキー:
  - **AWS Credentials** (Transcribe用、**必須** - 音声入力に使用)
  - Anthropic API Key (Claude)
  - Azure Speech Services Key

## 🚀 セットアップ

### 1. リポジトリのクローン

```bash
cd /path/to/rabbit
```

### 2. 依存関係のインストール

```bash
npm run install:all
```

### 3. 環境変数の設定

#### バックエンド

```bash
cp backend/.env.example backend/.env
```

以下の値を設定:

```env
# Server Configuration
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Anthropic Claude API (required)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Azure Speech Services (required)
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=japaneast

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rabbit_movies
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSLMODE=prefer
```

#### フロントエンド (AWS Transcribe用)

```bash
cd frontend
```

`.env.local` ファイルを作成:

```env
# AWS Transcribe Configuration (Frontend Direct)
# ⚠️ FOR DEMO ONLY - In production, use AWS Cognito for temporary credentials
NEXT_PUBLIC_AWS_REGION=us-west-2
NEXT_PUBLIC_AWS_ACCESS_KEY_ID=your_access_key_here
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY=your_secret_key_here

# WebSocket Backend URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws

# Waiting Audio Configuration
# Delay (in milliseconds) before playing random waiting audio after message submission
# Default: 300ms (0.3 seconds)
NEXT_PUBLIC_WAITING_DELAY=300

# Barge-in Configuration
# Minimum number of characters required before submitting transcribed text (final transcript)
# This prevents meaningless single-character submissions during barge-in
# Default: 5 (recommended to avoid false triggers)
NEXT_PUBLIC_BARGE_IN_MIN_CHARS=5

# Early Barge-in Detection (using partial transcripts)
# Minimum characters in partial transcript to trigger TTS stop
# This provides faster response (~300-500ms faster) before final transcript arrives
# Default: 2 (lower = faster but more false positives, higher = slower but more accurate)
NEXT_PUBLIC_EARLY_BARGE_IN_MIN_CHARS=2
```

**重要:** フロントエンドのAWS認証情報について
- **デモ版**: 直接認証情報を設定 (現在の実装)
- **本番環境**: AWS Cognitoを使用した一時認証情報を推奨
- 詳細は [AWS_TRANSCRIBE_SETUP.md](./AWS_TRANSCRIBE_SETUP.md) を参照

### 4. データベースの起動

```bash
docker-compose up -d
```

### 5. データベースのセットアップ

```bash
npm run db:setup
```

### 6. 開発サーバーの起動

```bash
npm run dev
```

- フロントエンド: http://localhost:3000
- バックエンド: http://localhost:3001
- WebSocket: ws://localhost:3001/ws

## 📁 プロジェクト構造

```
rabbit/
├── frontend/                 # Next.js フロントエンド
│   ├── src/
│   │   ├── app/             # App Router ページ
│   │   ├── components/      # React コンポーネント
│   │   ├── hooks/           # カスタムフック
│   │   └── types/           # TypeScript 型定義
│   └── package.json
│
├── backend/                  # Node.js バックエンド
│   ├── src/
│   │   ├── config/          # 設定
│   │   ├── db/              # データベース接続・クエリ
│   │   ├── services/        # 外部サービス連携
│   │   ├── types/           # 型定義
│   │   ├── websocket/       # WebSocketハンドラ
│   │   └── index.ts         # エントリーポイント
│   └── package.json
│
├── docker-compose.yml        # PostgreSQL
├── package.json             # ルートパッケージ
└── README.md
```

## 🎭 感情表現

ラビットは以下の感情を表現します:

| 感情 | 顔文字 | 色 |
|------|--------|-----|
| 普通 | (・ω・) | グレー |
| 嬉しい | (◕‿◕) | イエロー |
| ワクワク | (★▽★) | レッド |
| 考え中 | (・_・?) | シアン |
| 悲しい | (´・ω・`) | グレー |
| 驚き | (°o°) | オレンジ |
| 困惑 | (・・?) | パープル |
| 聞いています | (・ω・)🎤 | グリーン |
| 話しています | (・ω・)♪ | ブルー |

## 🎬 映画検索機能

「おすすめの映画は？」「宮崎駿の映画を教えて」などと質問すると、データベースから映画情報を検索して回答します。

サンプルデータには以下の映画が含まれています:
- 千と千尋の神隠し
- 君の名は。
- もののけ姫
- 七人の侍
- その他多数

## 🔧 技術スタック

| コンポーネント | 技術 |
|---------------|------|
| STT | AWS Transcribe Streaming (Frontend Direct) |
| LLM | Claude 3.5 Haiku |
| TTS | Azure Neural TTS (ja-JP-NanamiNeural) |
| Avatar | Lottie Animations |
| Frontend | Next.js 15, React 18, TypeScript |
| Backend | Node.js, Express, WebSocket |
| Database | PostgreSQL |

## 🎤 音声入力とバージイン機能

### 音声入力の使い方

1. マイクボタンをクリック
2. マイクアクセスを許可
3. 話し始める
4. リアルタイムで文字起こしが表示される
5. 話し終わると自動的にメッセージが送信される

### バージイン機能

**AIが話している最中に割り込めます:**

1. AIが音声応答を再生中
2. マイクボタンをクリックして話し始める
3. **自動的に以下が実行されます:**
   - 現在の音声再生が即座に停止
   - 音声キューがクリア
   - あなたの音声が文字起こしされる
   - 新しい応答が生成される

**デモ:** "映画を教えて" と質問 → AIが回答中 → 割り込んで "アニメ映画" と追加質問

### 技術詳細

詳しい実装方法、セットアップ手順、トラブルシューティングは以下を参照:

📘 **[AWS_TRANSCRIBE_SETUP.md](./AWS_TRANSCRIBE_SETUP.md)** - 完全なドキュメント

主な機能:
- フロントエンドから直接AWS Transcribeに接続
- リアルタイム音声ストリーミング (16kHz PCM)
- 途中結果の安定化機能
- バージイン検出とオーディオ制御
- エラーハンドリングと再接続

## 📝 API

### WebSocket メッセージ

**クライアント → サーバー:**

```json
// テキスト入力
{ "type": "text_input", "text": "こんにちは" }

// リスニング開始
{ "type": "start_listening" }

// リスニング停止
{ "type": "stop_listening" }
```

**サーバー → クライアント:**

```json
// 接続成功
{ "type": "connected", "sessionId": "...", "message": "..." }

// ステータス更新
{ "type": "status", "status": "thinking", "emotion": "thinking", "statusText": "考え中..." }

// ユーザーメッセージ
{ "type": "user_message", "text": "こんにちは" }

// アシスタントメッセージ
{ "type": "assistant_message", "text": "...", "emotion": "happy" }

// 音声データ
{ "type": "audio", "data": "base64...", "format": "mp3" }
```

## 🐛 トラブルシューティング

### データベースに接続できない

```bash
# PostgreSQL コンテナが起動しているか確認
docker-compose ps

# 起動していない場合
docker-compose up -d
```

### 音声が再生されない

- ブラウザの音声自動再生ポリシーにより、最初のユーザーインタラクション後に音声が再生されます
- Azure Speech Key が正しく設定されているか確認してください

### Claude APIエラー

- `ANTHROPIC_API_KEY` が正しく設定されているか確認
- APIキーに十分なクレジットがあるか確認

## 📄 ライセンス

MIT License
