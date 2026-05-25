import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { marketStream } from "../lib/marketDataStream";

const router: IRouter = Router();

// ── Math Helpers ──────────────────────────────────────────────────────────────

function calculateEMA(prices: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function calculateBollingerBands(prices: number[], period: number = 20) {
  const slice = prices.slice(-period);
  const len = slice.length;
  const sma = len > 0 ? slice.reduce((a, b) => a + b, 0) / len : 0;
  const variance = len > 0 ? slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / len : 0;
  const stdDev = Math.sqrt(variance);
  return {
    middle: sma,
    upper: sma + stdDev * 2,
    lower: sma - stdDev * 2,
  };
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (closes.length <= period) return 0;
  let trSum = 0;
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trSum += tr;
  }
  const slice = closes.slice(-period);
  return trSum / (closes.length - 1);
}

// ── Mock Option Chain Helpers (Simulated) ────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getSimulatedOI(strike: number, spot: number, type: "ce" | "pe"): number {
  // FIX: Add bounds checking and reduce randomness for more stable predictions
  const rand = seededRand(strike + (type === "ce" ? 0 : 999_999));
  const noise = 0.9 + rand() * 0.2; // Reduced noise from 0.8-1.2 to 0.9-1.1
  const offset = (strike - spot) / spot;
  const peakOffset = type === "ce" ? 0.01 : -0.01;
  const dist = Math.abs(offset - peakOffset);
  let oi = 4_000_000 * Math.exp(-60 * dist * dist) * noise;
  // Ensure OI is within realistic bounds
  oi = Math.min(20_000_000, Math.max(100_000, oi));
  return Math.round(oi / 1000) * 1000; // Round to nearest 1000
}

function calculatePCR(spot: number, range: number = 6): number {
  const atmStrike = Math.round(spot / 100) * 100;
  let callOI = 0;
  let putOI = 0;
  for (let i = -range; i <= range; i++) {
    const strike = atmStrike + i * 100;
    callOI += getSimulatedOI(strike, spot, "ce");
    putOI += getSimulatedOI(strike, spot, "pe");
  }
  return putOI / callOI;
}

router.get("/predict", async (req, res) => {
  try {
    const closes = marketStream.getPriceHistory('BANKNIFTY');
    if (closes.length === 0) throw new Error("No live market data available");
    
    const price = marketStream.getLatestPrice('BANKNIFTY');
    // Mock highs and lows since we are currently tracking only close prices via WS
    const highs = closes.map(c => c * 1.001);
    const lows = closes.map(c => c * 0.999);

    // ── Production Sentiment Engine ──────────────────────────────────────────

    let sentiment = 50; // Neutral baseline

    if (closes.length >= 20) {
      const ema20 = calculateEMA(closes, 20);
      const rsi = calculateRSI(closes, 14);
      const bb = calculateBollingerBands(closes, 20);
      const pcr = calculatePCR(price, 6);
      const atr = calculateATR(highs, lows, closes, 14);

      // Weighted Scoring (Total +/- 50 from base 50)
      
      // 1. Trend & Slope (Weight: 35%)
      let trendScore = 0;
      const emaBuffer = price * 0.0005; // 0.05% buffer to ignore tiny noise
      if (price > ema20 + emaBuffer) trendScore += 20;
      else if (price < ema20 - emaBuffer) trendScore -= 20;

      const ema20_prev = calculateEMA(closes.slice(0, -5), 20); // Slope over last 5 periods
      if (ema20 > ema20_prev) trendScore += 15;
      else if (ema20 < ema20_prev) trendScore -= 15;

      // 2. Momentum (Weight: 25%)
      let momentumScore = 0;
      if (rsi > 60) momentumScore += 25; // Confirmed bullish momentum
      else if (rsi < 40) momentumScore -= 25; // Confirmed bearish momentum
      else momentumScore = (rsi - 50) * 0.5; // Chop zone, dampen score

      // 3. Volatility / Bollinger %B (Weight: 20%)
      let volScore = 0;
      const percentB = bb.upper !== bb.lower ? (price - bb.lower) / (bb.upper - bb.lower) : 0.5;
      if (percentB > 0.8) volScore += 20; // Riding upper band
      else if (percentB < 0.2) volScore -= 20; // Riding lower band
      else volScore = (percentB - 0.5) * 10;

      // 4. Options Flow / PCR (Weight: 20%)
      let optionsScore = 0;
      if (pcr > 1.2) optionsScore += 20; // Put writing heavily outweighs call writing
      else if (pcr < 0.8) optionsScore -= 20; // Call writing heavily outweighs
      else optionsScore = (pcr - 1.0) * 20;

      sentiment = 50 + trendScore + momentumScore + volScore + optionsScore;
      
      // Final filter: If ATR is extremely high (wild volatility spikes), dampen the sentiment drastically to protect capital
      const volatilityDampener = atr > (price * 0.005) ? 0.5 : 1.0;
      sentiment = 50 + (sentiment - 50) * volatilityDampener;
      
      sentiment = Math.round(Math.max(5, Math.min(95, sentiment)));
    } else if (closes.length >= 3) {
      // Fallback to simple momentum for low-data scenarios
      const window = closes.slice(-3);
      const pctChange = ((window[window.length - 1] - window[0]) / window[0]) * 100;
      sentiment = Math.round(Math.min(100, Math.max(0, 50 + pctChange * 25)));
    }

    // Introduce a "Dead-zone" (40 to 60) where we recommend holding/waiting to avoid false alerts
    let prediction = "neutral";
    if (sentiment >= 60) prediction = "call";
    else if (sentiment <= 40) prediction = "put";

    res.json({ prediction, price, sentiment });
  } catch (err) {
    logger.error({ err }, "predict route error");
    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

export default router;
