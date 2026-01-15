# 🐰 Rabbit AI Avatar

日本語で会話できるAIライブアバターシステム。テキストベースのアバター表示で感情を表現し、映画情報のデータベース検索にも対応しています。

## ✨ 機能

- **日本語会話**: Claude 3.5 Haikuによる自然な日本語会話
- **感情表現**: アバターがテキスト顔文字で感情を表現
- **音声出力**: Azure Neural TTSによる感情豊かな音声合成
- **映画検索**: データベースから映画情報を検索して回答
- **リアルタイム**: WebSocketによる低遅延通信

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Chat Input  │  │ WebSocket    │  │ Text Avatar Display │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Node.js/Express)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ AWS         │  │ Claude 3.5  │  │ Azure Neural TTS     │ │
│  │ Transcribe  │→ │ Haiku       │→ │ (Nanami/Keita)       │ │
│  └─────────────┘  └──────┬──────┘  └──────────────────────┘ │
│                          │                                   │
│              ┌───────────▼───────────┐                      │
│              │ PostgreSQL (Movies)   │                      │
│              └───────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

📊 **詳細なワークフロー図は [WORKFLOW.md](./WORKFLOW.md) を参照してください。**

- 全体フロー図（12ステップ）
- シーケンス図
- パフォーマンスタイムライン
- 感情フロー
- 映画検索Tool Useフロー

## 📋 必要条件

- Node.js 18+
- PostgreSQL 14+ (Docker推奨)
- 以下のAPIキー:
  - Anthropic API Key (Claude)
  - Azure Speech Services Key
  - AWS Credentials (Transcribe用、オプション)

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

バックエンドの `.env` ファイルを作成:

```bash
cp backend/.env.example backend/.env
```

以下の値を設定:

```env
# Server Configuration
PORT=3001
CORS_ORIGIN=http://localhost:3000

# AWS Configuration (for Transcribe - optional)
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key

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
```

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
| STT | AWS Transcribe Streaming |
| LLM | Claude 3.5 Haiku |
| TTS | Azure Neural TTS (ja-JP-NanamiNeural) |
| Frontend | Next.js 15, React 18, TypeScript |
| Backend | Node.js, Express, WebSocket |
| Database | PostgreSQL |

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
