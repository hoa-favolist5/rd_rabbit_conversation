import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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

  // Azure Speech
  azure: {
    speechKey: process.env.AZURE_SPEECH_KEY || "",
    speechRegion: process.env.AZURE_SPEECH_REGION || "japaneast",
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
} as const;

// Validate required config
export function validateConfig(): void {
  const missing: string[] = [];

  if (!config.anthropic.apiKey) {
    missing.push("ANTHROPIC_API_KEY");
  }
  if (!config.azure.speechKey) {
    missing.push("AZURE_SPEECH_KEY");
  }

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(", ")}`);
    console.warn("Some features may not work correctly.");
  }
}
