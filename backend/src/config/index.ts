import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: join(__dirname, "../../.env") });

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3001", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",

  // LLM Provider Configuration
  llm: {
    provider: process.env.LLM_PROVIDER || "anthropic", // "anthropic" or "bedrock"
  },

  // AWS Services (Transcribe + Bedrock)
  aws: {
    region: process.env.AWS_REGION || "ap-northeast-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },

  // Anthropic Claude (direct API)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
  },

  // AWS Bedrock (Claude via Bedrock)
  bedrock: {
    region: process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || "ap-northeast-1",
    modelId: process.env.AWS_BEDROCK_MODEL_ID || "anthropic.claude-haiku-4-5-20251001-v1:0",
  },

  // PostgreSQL
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "rabbit_movies",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    sslMode: process.env.DB_SSLMODE || "prefer",
  },

  // Google Services
  google: {
    apiKey: process.env.GOOGLE_API_KEY || "",
    searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || "",
    // Google Cloud TTS
    cloudApiKey: process.env.GOOGLE_CLOUD_API_KEY || process.env.GOOGLE_API_KEY || "",
    ttsVoice: process.env.GOOGLE_TTS_VOICE || "ja-JP-Neural2-B",
  },
} as const;

// Validate required config
export function validateConfig(): void {
  const missing: string[] = [];

  // Check LLM provider configuration
  if (config.llm.provider === "anthropic" && !config.anthropic.apiKey) {
    missing.push("ANTHROPIC_API_KEY (required for Anthropic provider)");
  }

  if (config.llm.provider === "bedrock") {
    if (!config.aws.accessKeyId || !config.aws.secretAccessKey) {
      missing.push("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (required for Bedrock provider)");
    }
  }

  if (missing.length > 0) {
    logger.warn(`Missing environment variables: ${missing.join(", ")}`);
    logger.warn("Some features may not work correctly.");
  }

  logger.info(`LLM Provider: ${config.llm.provider}`);
  if (config.llm.provider === "bedrock") {
    logger.info(`Bedrock Model: ${config.bedrock.modelId}`);
  } else {
    logger.info(`Anthropic Model: ${config.anthropic.model}`);
  }
}
