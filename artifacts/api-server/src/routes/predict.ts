import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { getAntInstance } from "../../../../lib/ant";
import { ALICE_CONFIG } from "../../../../lib/broker-config";

const router: IRouter = Router();

declare const fetch: any;

interface PythonModelResult {
  model_score: number;
  model_prediction: string;
  confidence: number;
}

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
  const rs = gains / losses;
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
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trSum += tr;
  }
  return trSum / (closes.length - 1);
}

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
  const noise = 0.9 + rand() * 0.2;
  const offset = (strike - spot) / spot;
  const peakOffset = type === "ce" ? 0.01 : -0.01;
  const dist = Math.abs(offset - peakOffset);
  let oi = 4_000_000 * Math.exp(-60 * dist * dist) * noise;
  oi = Math.min(20_000_000, Math.max(100_000, oi));
  return Math.round(oi / 1000) * 1000;
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
  return callOI > 0 ? putOI / callOI : 1.0;
}

function buildSyntheticHistory(symbol: string, basePrice: number, length = 120) {
  const history: Array<Record<string, number>> = [];
  let price = basePrice;
  for (let i = 0; i < length; i++) {
    const move = (Math.random() - 0.5) * basePrice * 0.0015;
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + Math.abs(move) * 0.5 + Math.random() * 5;
    const low = Math.min(open, close) - Math.abs(move) * 0.5 - Math.random() * 5;
    history.push({
      open,
      high,
      low,
      close,
      volume: Math.floor(100000 + Math.random() * 50000),
      timestamp: Date.now() - (length - i) * 60000,
    });
    price = close;
  }
  return history;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildRuleScore(metrics: {
  price: number;
  ema20: number;
  ema20Prev: number;
  rsi: number;
  percentB: number;
  pcr: number;
  atr: number;
}): { score: number; components: Record<string, number>; ruleSignal: string } {
  let trendScore = 0;
  const buffer = metrics.price * 0.0005;
  if (metrics.price > metrics.ema20 + buffer) trendScore += 20;
  else if (metrics.price < metrics.ema20 - buffer) trendScore -= 20;
  if (metrics.ema20 > metrics.ema20Prev) trendScore += 15;
  else if (metrics.ema20 < metrics.ema20Prev) trendScore -= 15;

  let momentumScore = 0;
  if (metrics.rsi > 60) momentumScore += 25;
  else if (metrics.rsi < 40) momentumScore -= 25;
  else momentumScore = (metrics.rsi - 50) * 0.5;

  let volScore = 0;
  if (metrics.percentB > 0.8) volScore += 20;
  else if (metrics.percentB < 0.2) volScore -= 20;
  else volScore = (metrics.percentB - 0.5) * 10;

  let optionsScore = 0;
  if (metrics.pcr > 1.2) optionsScore += 20;
  else if (metrics.pcr < 0.8) optionsScore -= 20;
  else optionsScore = (metrics.pcr - 1.0) * 20;

  let total = 50 + trendScore + momentumScore + volScore + optionsScore;
  const atrDampener = metrics.atr > metrics.price * 0.005 ? 0.5 : 1.0;
  total = 50 + (total - 50) * atrDampener;
  total = clamp(Math.round(total), 0, 100);

  const ruleSignal = total >= 60 ? "BUY" : total <= 40 ? "SELL" : "NEUTRAL";
  return {
    score: total,
    components: {
      trend: trendScore,
      momentum: momentumScore,
      volatility: volScore,
      options: optionsScore,
      atrDampener,
    },
    ruleSignal,
  };
}

async function fetchPythonModelScore(payload: Record<string, unknown>): Promise<PythonModelResult | null> {
  try {
    const pythonServiceUrl =
      process.env.PYTHON_SERVICE_URL?.replace(/\/+$/, "") ||
      "http://127.0.0.1:8000";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(`${pythonServiceUrl}/model/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn({ status: response.status }, "Python model service returned an error");
      return null;
    }

    const body = (await response.json()) as PythonModelResult;
    return body;
  } catch (error) {
    logger.warn({ error }, "Unable to reach Python model service");
    return null;
  }
}

router.get("/predict", async (req, res) => {
  try {
    const symbol = "BANKNIFTY";
    const ant = getAntInstance(ALICE_CONFIG);
    const toDate = Math.floor(Date.now() / 1000).toString();
    const fromDate = Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000).toString();

    const historyResponse = await ant.getHistoricalData(symbol, fromDate, toDate, "1");
    let history = ((historyResponse as any)?.result as any[]) || (historyResponse as any);

    if (!history || !Array.isArray(history) || history.length === 0) {
      logger.warn({ symbol }, "No historical broker data available; using synthetic fallback history");
      const marketData = await ant.getMarketData(symbol);
      const basePrice = marketData?.ltp || (symbol.toUpperCase().includes("BANKNIFTY") ? 45000 : 22000);
      history = buildSyntheticHistory(symbol, basePrice, 120);
    }

    const closes = history.map((candle: any) => parseFloat(candle.close || candle.c || 0));
    const highs = history.map((candle: any) => parseFloat(candle.high || candle.h || 0));
    const lows = history.map((candle: any) => parseFloat(candle.low || candle.l || 0));
    const opens = history.map((candle: any) => parseFloat(candle.open || candle.o || 0));
    const price = closes[closes.length - 1];

    let pcr = 1.0;
    const optionsData = await ant.getOptionsChain(symbol);
    let callOI = 0;
    let putOI = 0;
    if (optionsData && optionsData.strikes && optionsData.strikes.length > 0) {
      optionsData.strikes.forEach((strike: any) => {
        callOI += strike.ce?.oi || 0;
        putOI += strike.pe?.oi || 0;
      });
      pcr = callOI > 0 ? putOI / callOI : calculatePCR(price, 6);
    } else {
      pcr = calculatePCR(price, 6);
    }

    const ema20 = calculateEMA(closes, 20);
    const ema20Prev = calculateEMA(closes.slice(0, -5), 20);
    const rsi = calculateRSI(closes, 14);
    const bb = calculateBollingerBands(closes, 20);
    const atr = calculateATR(highs, lows, closes, 14);
    const percentB = bb.upper !== bb.lower ? (price - bb.lower) / (bb.upper - bb.lower) : 0.5;

    const ruleResult = buildRuleScore({
      price,
      ema20,
      ema20Prev,
      rsi,
      percentB,
      pcr,
      atr,
    });

    const pythonPayload = {
      symbol,
      opens,
      highs,
      lows,
      closes,
      volumes: history.map((candle: any) => parseFloat(candle.volume || candle.v || 0)),
      pcr,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const pythonResult = await fetchPythonModelScore(pythonPayload);
    const modelScore = pythonResult?.model_score ?? 50;
    const modelPrediction = pythonResult?.model_prediction ?? "NEUTRAL";
    const modelConfidence = pythonResult?.confidence ?? 0;

    const blendedScore = clamp(Math.round(ruleResult.score * 0.6 + modelScore * 0.4), 0, 100);
    const finalSignal = blendedScore >= 60 ? "BUY" : blendedScore <= 40 ? "SELL" : "NEUTRAL";
    const legacyPrediction = finalSignal === "BUY" ? "call" : finalSignal === "SELL" ? "put" : "neutral";

    res.json({
      symbol,
      price,
      ruleScore: ruleResult.score,
      modelScore,
      blendedScore,
      sentiment: blendedScore,
      ruleSignal: ruleResult.ruleSignal,
      modelPrediction,
      modelConfidence,
      prediction: legacyPrediction,
      tradeSignal: finalSignal,
      details: {
        ema20,
        rsi,
        percentB,
        pcr,
        atr,
        ...ruleResult.components,
      },
    });
  } catch (err) {
    logger.error({ err }, "predict route error");
    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

export default router;
