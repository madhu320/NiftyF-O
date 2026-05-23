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
  const rand = seededRand(strike + (type === "ce" ? 0 : 999_999));
  const noise = 0.8 + rand() * 0.4;
  const offset = (strike - spot) / spot;
  const peakOffset = type === "ce" ? 0.01 : -0.01;
  const dist = Math.abs(offset - peakOffset);
  const oi = 4_000_000 * Math.exp(-60 * dist * dist) * noise;
  return oi;
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

      // Weighted Scoring (Total +/- 45 from 50)
      const trendScore = price > ema20 ? 15 : -15;           // Trend (Weight: 30%)
      const momentumScore = (rsi - 50) * 0.5;                // RSI (Weight: 25%)
      const volScore = price > bb.middle ? 10 : -10;         // Vol/Mean Rev (Weight: 20%)
      const optionsScore = Math.max(-15, Math.min(15, (pcr - 1.0) * 30)); // Options (Weight: 25%)

      sentiment = 50 + trendScore + momentumScore + volScore + optionsScore;
      
      // Final filter: If ATR is extremely high (wild spikes), dampen the sentiment
      const volatilityDampener = atr > (price * 0.005) ? 0.8 : 1.0;
      sentiment = 50 + (sentiment - 50) * volatilityDampener;
      
      sentiment = Math.round(Math.max(5, Math.min(95, sentiment)));
    } else if (closes.length >= 3) {
      // Fallback to simple momentum for low-data scenarios
      const window = closes.slice(-3);
      const pctChange = ((window[window.length - 1] - window[0]) / window[0]) * 100;
      sentiment = Math.round(Math.min(100, Math.max(0, 50 + pctChange * 25)));
    }

    const prediction = sentiment >= 50 ? "call" : "put";

    res.json({ prediction, price, sentiment });
  } catch (err) {
    logger.error({ err }, "predict route error");
    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

export default router;
