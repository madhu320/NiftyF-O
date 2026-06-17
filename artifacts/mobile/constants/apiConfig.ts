/**
 * Centralized API Configuration for Mobile App
 * All URLs are environment-based and production-ready
 */

import { Platform } from "react-native";

/**
 * Primary API URL (backend API server)
 * Supports:
 * - Expo environment variable: EXPO_PUBLIC_API_URL
 * - Android emulator: 10.0.2.2 (gateway to host machine)
 * - iOS simulator / web: localhost
 * - Production: Render URL (from env var)
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:5000/api"
    : "http://localhost:5000/api");

/**
 * Alice Blue (ANT) Broker endpoints
 */
export const ANT_ENDPOINTS = {
  market: (symbol: string) => `${API_BASE_URL}/ant/market/${symbol}`,
  positions: `${API_BASE_URL}/ant/positions`,
  optionsChain: (symbol: string) => `${API_BASE_URL}/ant/options-chain/${symbol}`,
  greeks: (symbol: string, expiry: string, strike: number, type: "CE" | "PE") =>
    `${API_BASE_URL}/ant/greeks/${symbol}/${expiry}/${strike}/${type}`,
  history: (symbol: string) => `${API_BASE_URL}/ant/history/${symbol}`,
  authStatus: `${API_BASE_URL}/ant/auth/status`,
  authDebug: `${API_BASE_URL}/ant/auth/debug`,
  authCode: `${API_BASE_URL}/ant/auth/code`,
};

/**
 * Trading signals and prediction endpoints
 */
export const SIGNAL_ENDPOINTS = {
  predict: `${API_BASE_URL}/predict`,
  signals: `${API_BASE_URL}/signals`,
  executeSignal: `${API_BASE_URL}/execution/execute`,
  margin: `${API_BASE_URL}/execution/margin`,
  portfolio: `${API_BASE_URL}/execution/portfolio`,
};

/**
 * Health check endpoint
 */
export const HEALTH_ENDPOINT = `${API_BASE_URL.replace("/api", "")}/api/healthz`;

/**
 * AI/ML Model Service URL (for predictions)
 */
export const PYTHON_SERVICE_URL =
  process.env.EXPO_PUBLIC_PYTHON_SERVICE_URL ||
  "http://127.0.0.1:8000";

/**
 * Risk management endpoints
 */
export const RISK_ENDPOINTS = {
  portfolio: `${API_BASE_URL}/risk/portfolio`,
  metrics: `${API_BASE_URL}/risk/metrics`,
  performanceHistory: `${API_BASE_URL}/risk/performance/history`,
};

/**
 * Broker OAuth/Auth redirect URLs
 */
export const AUTH_REDIRECT_URLS = {
  alice: process.env.EXPO_PUBLIC_ALICE_REDIRECT_URL || "exp://localhost:8081/alice-auth",
};

/**
 * Development/debug endpoints
 */
export const DEBUG_ENDPOINTS = {
  health: `${API_BASE_URL}/healthz`,
  version: `${API_BASE_URL}/version`,
};

export const API_CONFIG = {
  timeout: 15000,
  retries: 3,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
};

export function getFullURL(endpoint: string): string {
  // Handle absolute URLs
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }
  // Handle relative URLs - ensure base includes /api
  if (!endpoint.startsWith("/")) {
    return `${API_BASE_URL}/${endpoint}`;
  }
  return `${API_BASE_URL}${endpoint}`;
}

export function isDevelopment(): boolean {
  return __DEV__;
}

export function isProduction(): boolean {
  return !__DEV__ && process.env.EXPO_PUBLIC_API_URL?.includes("onrender.com");
}
