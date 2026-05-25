export const ALICE_CONFIG = {
  apiKey: process.env.ALICE_API_KEY || "YOUR_ALICE_API_KEY",
  apiSecret: process.env.ALICE_API_SECRET || "YOUR_ALICE_API_SECRET",
  userId: process.env.ALICE_USER_ID || "YOUR_ALICE_USER_ID",
  password: process.env.ALICE_PASSWORD || "YOUR_ALICE_PASSWORD",
  enabled: process.env.ALICE_ENABLED === "true" || false,
};
