/**
 * AWS Transcribe Service
 * Handles STS token retrieval and credential caching
 */

import { createLogger } from "@/utils/logger";

const log = createLogger("TranscribeService");

export interface STSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
}

export interface STSTokenResponse {
  credentials: STSCredentials;
  region: string;
}

/**
 * STS Credentials Cache
 * Caches temporary AWS credentials with automatic expiration handling
 */
class STSCredentialsCache {
  private credentials: STSTokenResponse | null = null;
  private expirationBuffer = 5 * 60 * 1000; // 5 minutes buffer before expiration

  /**
   * Get valid credentials (cached or fetch new ones)
   */
  async getCredentials(): Promise<STSTokenResponse> {
    if (this.isValid()) {
      log.debug("Using cached STS credentials");
      return this.credentials!;
    }

    log.debug("Fetching new STS credentials from backend");
    return await this.fetchCredentials();
  }

  /**
   * Fetch fresh credentials from backend
   */
  private async fetchCredentials(): Promise<STSTokenResponse> {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const response = await fetch(`${backendUrl}/api/transcribe/sts-token`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: STSTokenResponse = await response.json();

      // Validate response
      if (!data.credentials || !data.credentials.accessKeyId || !data.credentials.sessionToken) {
        throw new Error("Invalid STS token response from backend");
      }

      // Cache the credentials
      this.credentials = data;

      const expiresAt = new Date(data.credentials.expiration);
      const expiresIn = Math.round((expiresAt.getTime() - Date.now()) / 1000 / 60);
      log.info(`STS credentials cached (expires in ${expiresIn} minutes)`);

      return data;
    } catch (error) {
      log.error("Failed to fetch STS credentials:", error);
      throw new Error(
        `Failed to get AWS credentials: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if cached credentials are still valid
   */
  private isValid(): boolean {
    if (!this.credentials) {
      return false;
    }

    try {
      const expiresAt = new Date(this.credentials.credentials.expiration).getTime();
      const now = Date.now();
      const isValid = now < expiresAt - this.expirationBuffer;

      if (!isValid) {
        log.debug("Cached credentials expired or expiring soon");
      }

      return isValid;
    } catch (error) {
      log.error("Error checking credential validity:", error);
      return false;
    }
  }

  /**
   * Clear cached credentials (useful for testing or forcing refresh)
   */
  clear(): void {
    log.debug("Clearing cached credentials");
    this.credentials = null;
  }

  /**
   * Get time until expiration in seconds (for debugging)
   */
  getTimeUntilExpiration(): number | null {
    if (!this.credentials) {
      return null;
    }

    try {
      const expiresAt = new Date(this.credentials.credentials.expiration).getTime();
      return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const stsCredentialsCache = new STSCredentialsCache();

/**
 * Transcribe Service API
 */
export const TranscribeService = {
  /**
   * Get STS token for AWS Transcribe
   */
  async getSTSToken(): Promise<STSTokenResponse> {
    return await stsCredentialsCache.getCredentials();
  },

  /**
   * Clear cached credentials
   */
  clearCache(): void {
    stsCredentialsCache.clear();
  },

  /**
   * Get credential expiration info (for debugging)
   */
  getCredentialInfo(): { expiresIn: number | null; cached: boolean } {
    return {
      expiresIn: stsCredentialsCache.getTimeUntilExpiration(),
      cached: stsCredentialsCache.getTimeUntilExpiration() !== null,
    };
  },

  /**
   * Health check for transcribe service
   */
  async healthCheck(): Promise<{ status: string; configured: boolean; method: string; region: string }> {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const response = await fetch(`${backendUrl}/api/transcribe/health`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      log.error("Transcribe health check failed:", error);
      throw error;
    }
  },
};
