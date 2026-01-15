import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { config, validateConfig } from "./config/index.js";
import { handleConnection, getSessionCount } from "./websocket/handler.js";
import { testConnection } from "./db/connection.js";

// Validate configuration
validateConfig();

// Create Express app
const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    activeSessions: getSessionCount(),
  });
});

// API info endpoint
app.get("/api", (_req, res) => {
  res.json({
    name: "Rabbit AI Avatar API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      websocket: "/ws",
    },
  });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: "/ws",
});

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`🔌 New WebSocket connection from ${clientIp}`);
  handleConnection(ws);
});

// Start server
async function start() {
  console.log("🐰 Starting Rabbit AI Avatar Server...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.log("⚠️  Database not available. Movie search will return empty results.");
    console.log("   Run 'npm run db:setup' after setting up PostgreSQL.");
  }

  // Start HTTP server
  server.listen(config.port, () => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`🔌 WebSocket available at ws://localhost:${config.port}/ws`);
    console.log(`🌐 CORS origin: ${config.corsOrigin}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Ready to accept connections! 🎉");
  });
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down gracefully...");
  wss.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  wss.close();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Start the server
start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
