/**
 * AWS Transcribe STS Token Endpoint
 * Provides temporary AWS credentials for frontend Transcribe access
 */

import { Router } from "express";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { logger } from "../utils/logger.js";

const router = Router();

// STS Client configuration
const stsClient = new STSClient({
  region: process.env.AWS_REGION || "ap-northeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * GET /api/transcribe/sts-token
 * 
 * Returns temporary AWS credentials for AWS Transcribe Streaming
 * Uses AWS STS AssumeRole to generate time-limited credentials
 * 
 * Response:
 * {
 *   credentials: {
 *     accessKeyId: string,
 *     secretAccessKey: string,
 *     sessionToken: string,
 *     expiration: string (ISO 8601)
 *   },
 *   region: string
 * }
 */
router.get("/sts-token", async (req, res) => {
  try {
    logger.debug("STS token request received");

    // Validate environment configuration
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.error("AWS credentials not configured in backend environment");
      return res.status(500).json({
        error: "AWS credentials not configured on server",
      });
    }

    // Check if role ARN is configured (optional - can use direct credentials)
    const roleArn = process.env.AWS_TRANSCRIBE_ROLE_ARN;
    
    if (roleArn) {
      // Use AssumeRole for better security (recommended for production)
      logger.debug(`Assuming role: ${roleArn}`);
      
      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `rabbit-transcribe-${Date.now()}`,
        DurationSeconds: 3600, // 1 hour
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "transcribe:StartStreamTranscription",
                "transcribe:StartStreamTranscriptionWebSocket",
              ],
              Resource: "*",
            },
          ],
        }),
      });

      const response = await stsClient.send(command);

      if (!response.Credentials) {
        throw new Error("No credentials returned from STS");
      }

      logger.info("STS credentials generated successfully (AssumeRole)");

      return res.json({
        credentials: {
          accessKeyId: response.Credentials.AccessKeyId!,
          secretAccessKey: response.Credentials.SecretAccessKey!,
          sessionToken: response.Credentials.SessionToken!,
          expiration: response.Credentials.Expiration!.toISOString(),
        },
        region: process.env.AWS_REGION || "ap-northeast-1",
      });
    } else {
      // Fallback: Use GetSessionToken for temporary credentials
      // This is simpler but less secure than AssumeRole
      logger.debug("Using GetSessionToken (no role ARN configured)");
      
      const { GetSessionTokenCommand } = await import("@aws-sdk/client-sts");
      
      const command = new GetSessionTokenCommand({
        DurationSeconds: 3600, // 1 hour
      });

      const response = await stsClient.send(command);

      if (!response.Credentials) {
        throw new Error("No credentials returned from STS");
      }

      logger.info("STS credentials generated successfully (GetSessionToken)");

      return res.json({
        credentials: {
          accessKeyId: response.Credentials.AccessKeyId!,
          secretAccessKey: response.Credentials.SecretAccessKey!,
          sessionToken: response.Credentials.SessionToken!,
          expiration: response.Credentials.Expiration!.toISOString(),
        },
        region: process.env.AWS_REGION || "ap-northeast-1",
      });
    }
  } catch (error) {
    logger.error("STS token generation failed:", { data: error });
    
    // Provide helpful error messages
    let errorMessage = "Failed to generate STS token";
    
    if (error instanceof Error) {
      if (error.message.includes("InvalidClientTokenId")) {
        errorMessage = "Invalid AWS credentials configured on server";
      } else if (error.message.includes("AccessDenied")) {
        errorMessage = "AWS credentials lack permission to assume role or get session token";
      } else if (error.message.includes("NoSuchEntity")) {
        errorMessage = "Configured IAM role does not exist";
      }
    }
    
    return res.status(500).json({
      error: errorMessage,
      details: process.env.DEBUG === "true" ? (error instanceof Error ? error.message : String(error)) : undefined,
    });
  }
});

/**
 * GET /api/transcribe/health
 * 
 * Health check for transcribe service
 */
router.get("/health", (_req, res) => {
  const hasCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const hasRoleArn = !!process.env.AWS_TRANSCRIBE_ROLE_ARN;
  
  res.json({
    status: "ok",
    configured: hasCredentials,
    method: hasRoleArn ? "AssumeRole" : "GetSessionToken",
    region: process.env.AWS_REGION || "ap-northeast-1",
  });
});

export default router;
