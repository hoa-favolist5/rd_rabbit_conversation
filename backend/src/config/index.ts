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

  // AWS Transcribe
  aws: {
    region: process.env.AWS_REGION || "ap-northeast-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },

  // Anthropic Claude
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
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

  if (!config.anthropic.apiKey) {
    missing.push("ANTHROPIC_API_KEY");
  }

  if (missing.length > 0) {
    logger.warn(`Missing environment variables: ${missing.join(", ")}`);
    logger.warn("Some features may not work correctly.");
  }
}
