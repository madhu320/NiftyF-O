import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { getAntInstance } from "../../../../lib/ant";
import { ALICE_CONFIG } from "../../../../lib/broker-config";
import { marketStream } from "../lib/marketDataStream";

const router: IRouter = Router();

declare const fetch: any;

const NODE_ENV = process.env.NODE_ENV || "development";
const DEFAULT_REALTIME_MODE = NODE_ENV === "production" ? "strict" : "hybrid";

interface PythonModelResult {
  model_score: number;
  model_prediction: string;
  confidence: number;
}

type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const REALTIME_MODE = (process.env.REALTIME_MODE || DEFAULT_REALTIME_MODE).toLowerCase();
const STRICT_REALTIME = REALTIME_MODE === "strict";
const REQUIRE_PYTHON_MODEL =
  (process.env.REQUIRE_PYTHON_MODEL || (NODE_ENV === "production" ? "true" : "false")) === "true";
const HISTORY_CACHE_TTL_MS = Number(process.env.HISTORY_CACHE_TTL_MS || 12_000);
const PCR_CACHE_TTL_MS = Number(process.env.PCR_CACHE_TTL_MS || 20_000);
const ANT_BACKOFF_MS = Number(process.env.ANT_BACKOFF_MS || 120_000);
const PYTHON_BACKOFF_MS = Number(process.env.PYTHON_BACKOFF_MS || 60_000);
const NSE_BACKOFF_MS = Number(process.env.NSE_BACKOFF_MS || 90_000);
const PYTHON_PREDICT_ENABLED = (process.env.PYTHON_PREDICT_ENABLED || "true") === "true";

const historyCache = new Map<string, { data: Candle[]; expiresAt: number }>();
const pcrCache = new Map<string, { value: number; expiresAt: number }>();

let antUnavailableUntil = 0;
let pythonUnavailableUntil = 0;
let nseUnavailableUntil = 0;

let nseCookie = "";
let nseCookieExpiresAt = 0;

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

// Fetch real 1-minute OHLCV candles from Yahoo Finance for the last 2 days
async function fetchRealHistory(symbol: string): Promise<Candle[]> {
  const ticker = symbol === 'BANKNIFTY' ? '%5ENSEBANK' : '%5ENSEI';
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=2d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const data = await res.json() as any;
    const result = data.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0] ?? {};
    const opens: number[] = q.open ?? [];
    const highs: number[] = q.high ?? [];
    const lows: number[] = q.low ?? [];
    const closes: number[] = q.close ?? [];
    const volumes: number[] = q.volume ?? [];

    const candles = timestamps
      .map((ts, i) => ({
        timestamp: ts * 1000,
        open: opens[i] ?? closes[i] ?? 0,
        high: highs[i] ?? closes[i] ?? 0,
        low: lows[i] ?? closes[i] ?? 0,
        close: closes[i] ?? 0,
        volume: volumes[i] ?? 0,
      }))
      .filter(c => c.close > 0);

    if (candles.length > 0) {
      logger.debug({ symbol, count: candles.length }, 'Loaded real candles from Yahoo Finance');
      return candles;
    }
  } catch (err) {
    logger.warn({ symbol, err }, 'Yahoo Finance candle fetch failed');
  }
  return [];
}

async function fetchNseCookie(baseHeaders: Record<string, string>): Promise<string> {
  const now = Date.now();
  if (nseCookie && nseCookieExpiresAt > now) {
    return nseCookie;
  }

  const landing = await fetch('https://www.nseindia.com', {
    headers: baseHeaders,
    signal: AbortSignal.timeout(3000),
  });

  nseCookie = landing.headers.get('set-cookie') ?? "";
  nseCookieExpiresAt = now + 120_000;
  return nseCookie;
}

// Fetch real PCR from NSE India options chain API
async function fetchRealPCR(symbol: string): Promise<number | null> {
  const now = Date.now();
  if (nseUnavailableUntil > now) {
    return null;
  }

  try {
    const nseSymbol = symbol === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY';
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nseindia.com/option-chain',
      'Origin': 'https://www.nseindia.com',
    } as const;

    const cookie = await fetchNseCookie(baseHeaders);

    const res = await fetch(`https://www.nseindia.com/api/option-chain-indices?symbol=${nseSymbol}`, {
      headers: {
        ...baseHeaders,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) throw new Error(`NSE HTTP ${res.status}`);
    const data = await res.json() as any;
    const pcr = data?.filtered?.CE?.totOI > 0
      ? data.filtered.PE.totOI / data.filtered.CE.totOI
      : null;
    if (pcr !== null) logger.debug({ symbol, pcr }, 'Real PCR from NSE India');
    return pcr;
  } catch (err) {
    logger.warn({ symbol, err }, 'NSE PCR fetch failed, will use fallback');
    nseUnavailableUntil = now + NSE_BACKOFF_MS;
    return null;
  }
}

async function getHistoryFast(symbol: string): Promise<Candle[]> {
  const now = Date.now();
  const cached = historyCache.get(symbol);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const history = await fetchRealHistory(symbol);
  if (history.length > 0) {
    historyCache.set(symbol, { data: history, expiresAt: now + HISTORY_CACHE_TTL_MS });
    return history;
  }

  const streamPrices = marketStream.getPriceHistory(symbol);
  if (streamPrices.length > 0) {
    const streamCandles = streamPrices.map((close, i) => ({
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
      timestamp: Date.now() - (streamPrices.length - i) * 60_000,
    }));
    historyCache.set(symbol, { data: streamCandles, expiresAt: now + 3_000 });
    logger.info({ symbol, count: streamCandles.length }, 'Using marketStream history fallback');
    return streamCandles;
  }

  return [];
}

async function getPcrFast(symbol: string): Promise<number> {
  const now = Date.now();
  const cached = pcrCache.get(symbol);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const nsePcr = await fetchRealPCR(symbol);
  if (nsePcr !== null) {
    pcrCache.set(symbol, { value: nsePcr, expiresAt: now + PCR_CACHE_TTL_MS });
    return nsePcr;
  }

  // Keep deterministic neutral fallback for speed and stability.
  return cached?.value ?? 1.0;
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
  if (!PYTHON_PREDICT_ENABLED) {
    return null;
  }

  const now = Date.now();
  if (pythonUnavailableUntil > now) {
    return null;
  }

  try {
    const pythonServiceUrl =
      process.env.PYTHON_SERVICE_URL?.replace(/\/+$/, "") ||
      "http://127.0.0.1:8000";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);
    const response = await fetch(`${pythonServiceUrl}/model/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn({ status: response.status }, "Python model service returned an error");
      pythonUnavailableUntil = now + PYTHON_BACKOFF_MS;
      return null;
    }

    const body = (await response.json()) as PythonModelResult;
    return body;
  } catch (error) {
    logger.warn({ error }, "Unable to reach Python model service");
    pythonUnavailableUntil = now + PYTHON_BACKOFF_MS;
    return null;
  }
}

router.get("/predict", async (req, res) => {
  try {
    const symbol = "BANKNIFTY";
    const [history, pcr] = await Promise.all([
      getHistoryFast(symbol),
      getPcrFast(symbol),
    ]);

    if (history.length === 0) {
      if (STRICT_REALTIME) {
        res.status(503).json({ error: 'Real-time market data unavailable in strict mode' });
        return;
      }

      // Optional ANT fallback in hybrid mode when real feeds are temporarily unavailable.
      const now = Date.now();
      if (antUnavailableUntil <= now) {
        try {
          const ant = getAntInstance(ALICE_CONFIG);
          const toDate = Math.floor(Date.now() / 1000).toString();
          const fromDate = Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000).toString();
          const antHistoryResponse = await Promise.race([
            ant.getHistoricalData(symbol, fromDate, toDate, "1"),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
          ]);
          const antHistory = ((antHistoryResponse as any)?.result as any[]) || (antHistoryResponse as any);
          if (Array.isArray(antHistory) && antHistory.length > 0) {
            historyCache.set(symbol, { data: antHistory, expiresAt: now + 3_000 });
          } else {
            antUnavailableUntil = now + ANT_BACKOFF_MS;
          }
        } catch {
          antUnavailableUntil = now + ANT_BACKOFF_MS;
        }
      }
    }

    const resolvedHistory = historyCache.get(symbol)?.data ?? history;
    if (resolvedHistory.length === 0) {
      res.status(503).json({ error: "No market data available" });
      return;
    }

    const closes = resolvedHistory.map((candle: any) => parseFloat(candle.close || candle.c || 0));
    const highs = resolvedHistory.map((candle: any) => parseFloat(candle.high || candle.h || 0));
    const lows = resolvedHistory.map((candle: any) => parseFloat(candle.low || candle.l || 0));
    const opens = resolvedHistory.map((candle: any) => parseFloat(candle.open || candle.o || 0));
    const price = closes[closes.length - 1];

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
      volumes: resolvedHistory.map((candle: any) => parseFloat(candle.volume || candle.v || 0)),
      pcr,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const pythonResult = await fetchPythonModelScore(pythonPayload);
    if (REQUIRE_PYTHON_MODEL && pythonResult === null) {
      res.status(503).json({ error: "Python model is required but unavailable" });
      return;
    }

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
        realtimeMode: REALTIME_MODE,
        pythonUsed: pythonResult !== null,
        ...ruleResult.components,
      },
    });
  } catch (err) {
    logger.error({ err }, "predict route error");
    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

export default router;
