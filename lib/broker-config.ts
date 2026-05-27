/**
 * BROKER API KEY CONFIGURATION
 * 
 * Add your actual API credentials here. This file contains placeholders for all supported brokers.
 * IMPORTANT: Never commit real API keys to version control. Use environment variables instead.
 * 
 * For sensitive deployment:
 * 1. Use .env.local (not in git)
 * 2. Use environment variable secrets in your deployment platform
 * 3. Use the encryption utility: lib/db/src/encryption.ts
 */

try {
  // Safely load dotenv only in Node.js backend environments
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const dotenv = require("dotenv");
    const path = require("path");
    const fs = require("fs");

    // Search multiple locations because __dirname changes when TypeScript compiles to /dist
    const envPaths = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), "../../../.env"),
      path.resolve(process.cwd(), "../../../.env.local"),
      path.resolve(__dirname, "../.env"),
      path.resolve(__dirname, "../.env.local"),
      path.resolve(__dirname, "../../../.env"),
      path.resolve(__dirname, "../../../.env.local"),
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`✅ Loaded environment variables from: ${envPath}`);
      }
    }
  }
} catch (error) {
  console.error("⚠️ Failed to load dotenv:", error);
}

/**
 * ALICE BLUE (ANT) - Indian Broker
 * Signup: https://www.aliceblueonline.com/
 * Docs: https://www.aliceblueonline.com/api-docs
 */
export const ALICE_CONFIG = {
  apiKey: process.env.ALICE_API_KEY || "YOUR_ALICE_API_KEY",
  apiSecret: process.env.ALICE_API_SECRET || "YOUR_ALICE_API_SECRET",
  userId: process.env.ALICE_USER_ID || "YOUR_ALICE_USER_ID",
  password: process.env.ALICE_PASSWORD || "YOUR_ALICE_PASSWORD", // For 2FA if needed
  frontendRedirectUrl: process.env.ALICE_FRONTEND_REDIRECT_URL || "http://localhost:5000",
  enabled: process.env.ALICE_ENABLED === "true" || false,
};

/**
 * ZERODHA - Indian Broker
 * Signup: https://zerodha.com/
 * Docs: https://kite.trade/docs/
 */
export const ZERODHA_CONFIG = {
  apiKey: process.env.ZERODHA_API_KEY || "YOUR_ZERODHA_API_KEY",
  apiSecret: process.env.ZERODHA_API_SECRET || "YOUR_ZERODHA_API_SECRET",
  publicToken: process.env.ZERODHA_PUBLIC_TOKEN || "YOUR_ZERODHA_PUBLIC_TOKEN",
  userId: process.env.ZERODHA_USER_ID || "YOUR_ZERODHA_USER_ID",
  enabled: process.env.ZERODHA_ENABLED === "true" || false,
};

/**
 * ALPACA - US Broker (for reference, not compatible with NSE)
 * Signup: https://alpaca.markets/
 * Docs: https://docs.alpaca.markets/
 */
export const ALPACA_CONFIG = {
  apiKey: process.env.ALPACA_API_KEY || "YOUR_ALPACA_API_KEY",
  apiSecret: process.env.ALPACA_API_SECRET || "YOUR_ALPACA_API_SECRET",
  baseURL: process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets",
  enabled: process.env.ALPACA_ENABLED === "true" || false,
  // NOTE: Not recommended for NSE options trading
};

/**
 * UPSTOX - Indian Broker Alternative
 * Signup: https://upstox.com/
 * Docs: https://upstox.com/developer/
 */
export const UPSTOX_CONFIG = {
  apiKey: process.env.UPSTOX_API_KEY || "YOUR_UPSTOX_API_KEY",
  apiSecret: process.env.UPSTOX_API_SECRET || "YOUR_UPSTOX_API_SECRET",
  redirectUrl: process.env.UPSTOX_REDIRECT_URL || "http://localhost:3000/auth/callback",
  enabled: process.env.UPSTOX_ENABLED === "true" || false,
};

/**
 * ENCRYPTION KEY
 * Used to encrypt/decrypt sensitive credentials in database
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export const ENCRYPTION_CONFIG = {
  encryptionKey: process.env.ENCRYPTION_KEY || "GENERATE_THIS_KEY_AND_SET_IN_ENV",
  algorithm: "aes-256-gcm",
  saltLength: 16,
  ivLength: 12,
};

/**
 * ACTIVE BROKER SELECTION
 * Determines which broker integration to use
 */
export type BrokerType = "alice" | "zerodha" | "alpaca" | "upstox";
export const ACTIVE_BROKER: BrokerType = (process.env.ACTIVE_BROKER as BrokerType) || "alice";

export const getBrokerConfig = (broker: BrokerType = ACTIVE_BROKER) => {
  switch (broker) {
    case "alice":
      return ALICE_CONFIG;
    case "zerodha":
      return ZERODHA_CONFIG;
    case "alpaca":
      return ALPACA_CONFIG;
    case "upstox":
      return UPSTOX_CONFIG;
    default:
      throw new Error(`Unknown broker: ${broker}`);
  }
};

/**
 * SETUP INSTRUCTIONS
 * 
 * 1. CREATE .env.local FILE:
 *    cp .env.example .env.local
 * 
 * 2. ADD YOUR API KEYS:
 *    # Alice Blue
 *    ALICE_API_KEY=your_alice_api_key_here
 *    ALICE_API_SECRET=your_alice_api_secret_here
 *    ALICE_USER_ID=your_alice_user_id_here
 *    ALICE_ENABLED=true
 *    ACTIVE_BROKER=alice
 * 
 *    # Or Zerodha
 *    ZERODHA_API_KEY=your_zerodha_api_key_here
 *    ZERODHA_API_SECRET=your_zerodha_api_secret_here
 *    ZERODHA_PUBLIC_TOKEN=your_zerodha_public_token_here
 *    ZERODHA_ENABLED=true
 *    ACTIVE_BROKER=zerodha
 * 
 * 3. GENERATE ENCRYPTION KEY:
 *    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *    ENCRYPTION_KEY=paste_here
 * 
 * 4. IN DEPLOYMENT (Vercel, Render, etc):
 *    Set these as environment secrets in your platform dashboard
 *    Never commit .env.local to git
 */
