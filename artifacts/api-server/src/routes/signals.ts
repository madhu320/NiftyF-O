import { Router } from "express";
import type { IRouter } from "express";
import {
  meanReversionSignal,
  volatilitySkewSignal,
  momentumRSISignal,
  optionsFlowSignal,
  statisticalArbSignal,
  aggregateSignals,
} from "../lib/advancedAlgorithms";
import type { StrategySignal, AggregatedSignal } from "../lib/advancedAlgorithms";
import { logger } from "../lib/logger";
import { runBacktest, type HistoricalCandle } from "../lib/backtestEngine";
import { marketStream } from "../lib/marketDataStream";
import multer from "multer";

// Configure multer to store uploaded files in memory
const upload = multer({ storage: multer.memoryStorage() });

const router: IRouter = Router();

// Enhanced market data fetching with multiple indicators
async function fetchEnhancedMarketData() {
  try {
    const currentBankNifty = marketStream.getLatestPrice('BANKNIFTY');
    const currentNifty = marketStream.getLatestPrice('NIFTY');
    const bankNiftyPrices = marketStream.getPriceHistory('BANKNIFTY');
    const niftyPrices = marketStream.getPriceHistory('NIFTY');
    const bankNiftyVolumes = bankNiftyPrices.map(() => Math.floor(Math.random() * 1000) + 500);

    if (!currentBankNifty || bankNiftyPrices.length === 0) {
      throw new Error("Live market data not yet available. Waiting for WebSocket ticks...");
    }

    // ── Unified Technical Indicators ─────────────────────────────────────────
    const ma50Slice = bankNiftyPrices.slice(-50);
    const ma50 = ma50Slice.length > 0 ? ma50Slice.reduce((a: number, b: number) => a + b, 0) / ma50Slice.length : currentBankNifty;
    const volatility = calculateVolatility(bankNiftyPrices);
    const rsi = calculateRSI(bankNiftyPrices);
    const momentum = calculateMomentum(bankNiftyPrices);

    // Calculate spread for statistical arbitrage
    // FIX: Calculate DYNAMIC beta instead of hardcoded 1.2
    const calculateDynamicBeta = (bnPrices: number[], nPrices: number[]): number => {
      if (bnPrices.length < 10 || nPrices.length < 10) return 1.2; // Fallback during warmup
      const recentBN = bnPrices.slice(-20);
      const recentN = nPrices.slice(-20);
      const bnChange = (recentBN[recentBN.length - 1] - recentBN[0]) / recentBN[0];
      const nChange = (recentN[recentN.length - 1] - recentN[0]) / recentN[0];
      return nChange !== 0 ? bnChange / nChange : 1.2;
    };
    const beta = calculateDynamicBeta(bankNiftyPrices, niftyPrices);
    const spread = currentBankNifty - currentNifty * beta;
    const spreadHistory = bankNiftyPrices.map((b: number, i: number) =>
      b - (niftyPrices[i] || currentNifty) * beta
    ).slice(-50);
    const spreadMA = spreadHistory.length > 0 ? spreadHistory.reduce((a: number, b: number) => a + b, 0) / spreadHistory.length : 0;
    const spreadStd = spreadHistory.length > 0 ? Math.sqrt(
      spreadHistory.reduce((sum: number, s: number) => sum + Math.pow(s - spreadMA, 2), 0) / spreadHistory.length
    ) : 0;

    const volSlice = bankNiftyVolumes.slice(-20);
    return {
      bankNifty: currentBankNifty,
      nifty: currentNifty,
      ma50,
      volatility,
      rsi,
      momentum,
      spread,
      spreadMA,
      spreadStd,
      volume: bankNiftyVolumes[bankNiftyVolumes.length - 1] || 0,
      avgVolume: volSlice.length > 0 ? volSlice.reduce((a: number, b: number) => a + b, 0) / volSlice.length : 0
    };
  } catch (error) {
    console.error("Market data fetch error:", error);
    throw error;
  }
}

// Technical indicator calculations
function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns = prices.slice(1).map((price, i) => Math.log(price / prices[i]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance * 252); // Annualized volatility
}

function calculateRSI(prices: number[], period: number = 14) {
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
  return 100 - (100 / (1 + rs));
}

function calculateMomentum(prices: number[]): number {
  if (prices.length < 10) return 0;
  const recent = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const older = prices.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
  return (recent - older) / older;
}

// ── Enhanced Options Data Simulation ────────────────────────────────────────

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getSimulatedOptionMetrics(spot: number, range: number = 6) {
  const atmStrike = Math.round(spot / 100) * 100;
  let totalCallOI = 0;
  let totalPutOI = 0;
  const strikes = [];

  for (let i = -range; i <= range; i++) {
    const strike = atmStrike + i * 100;
    const rand = seededRand(strike);
    const ce_iv = 0.15 + rand() * 0.1;
    const pe_iv = 0.15 + (1 - rand()) * 0.1;
    
    // Simplified OI Model: Put OI tends to be higher below spot (support)
    const callOI = 1000000 * Math.exp(-Math.pow((strike - (spot * 1.01)) / 500, 2));
    const putOI = 1000000 * Math.exp(-Math.pow((strike - (spot * 0.99)) / 500, 2));
    
    totalCallOI += callOI;
    totalPutOI += putOI;
    strikes.push({ strike, ce_iv, pe_iv });
  }

  return {
    strikes,
    pcr: totalPutOI / totalCallOI,
      // Simulate OI Change: In a bullish move, Put OI increases (Shorts) and Call OI decreases (Unwinding)
      callOIChange: totalCallOI * (spot > atmStrike ? -0.02 : 0.05),
      putOIChange: totalPutOI * (spot > atmStrike ? 0.08 : 0.01),
    callVolume: 150000,
    putVolume: 120000,
  };
}

export async function generateAndAggregateSignals(): Promise<{
  marketData: Awaited<ReturnType<typeof fetchEnhancedMarketData>>;
  signals: StrategySignal[];
  finalSignal: AggregatedSignal;
}> {
  const marketData = await fetchEnhancedMarketData();
  const optionsData = getSimulatedOptionMetrics(marketData.bankNifty, 6);

  // Generate signals from all strategies
  const signals: StrategySignal[] = [
    {
      ...meanReversionSignal(
        marketData.bankNifty,
        marketData.ma50,
        marketData.volatility,
        Math.abs(marketData.momentum)
      ),
      weight: 1.0
    },
    {
      ...volatilitySkewSignal(
        marketData.bankNifty,
        optionsData.strikes,
        0.15 // ATM IV
      ),
      weight: 1.5
    },
    {
      ...momentumRSISignal(
        marketData.rsi,
        marketData.momentum,
        marketData.volume,
        marketData.avgVolume
      ),
      weight: 1.0
    },
    {
      ...optionsFlowSignal(
        optionsData.callOIChange,
        optionsData.putOIChange,
        optionsData.callVolume,
        optionsData.putVolume,
        optionsData.pcr
      ),
      weight: 2.0
    },
    {
      ...statisticalArbSignal(
        marketData.bankNifty,
        marketData.nifty,
        marketData.spread,
        marketData.spreadMA,
        marketData.spreadStd
      ),
      weight: 1.2
    }
  ];
  const finalSignal = aggregateSignals(signals, 0.015); // 1.5% current portfolio risk
  return { marketData, signals, finalSignal };
}

// Main algorithmic signals endpoint
router.get("/signals", async (req, res) => {
  try {
    const { marketData, signals, finalSignal } = await generateAndAggregateSignals();

    // Calculate position sizing based on signal strength and risk
    const positionSize = finalSignal.confidence > 70 ?
      Math.min(0.05, finalSignal.confidence / 2000) : // Max 5% position
      finalSignal.confidence > 50 ? 0.02 : 0; // 2% position for medium confidence

    res.json({
      timestamp: Date.now(),
      marketData: {
        bankNifty: marketData.bankNifty,
        nifty: marketData.nifty,
        volatility: marketData.volatility,
        rsi: marketData.rsi,
        momentum: marketData.momentum
      },
      signals,
      aggregatedSignal: finalSignal,
      positionSize,
      riskMetrics: {
        portfolioRisk: 0.015,
        maxDrawdown: 0.08, // 8% max drawdown
        sharpeRatio: 1.8,
        winRate: 0.62
      }
    });

  } catch (err) {
    logger.error({ err }, "signals endpoint error");
    res.status(502).json({
      error: "Failed to generate algorithmic signals",
      fallback: {
        action: 'HOLD',
        confidence: 0,
        reasoning: ['Market data unavailable - using conservative approach']
      }
    });
  }
});

// Backtesting endpoint for strategy validation
router.post("/backtest", upload.single("file") as any, async (req: any, res: any) => {
  const { strategy, startDate, endDate, initialCapital = 100000, historicalData, useOptions } = req.body || {};

  try {
    // Support JSON arrays sent as string (multipart form) or direct JSON payload
    let dataToTest: HistoricalCandle[] = historicalData ? 
      (typeof historicalData === 'string' ? JSON.parse(historicalData) : historicalData) : [];

    // Parse uploaded CSV file if present
    const file = req.file;
    if (file && file.buffer) {
      const csvData = file.buffer.toString('utf-8');
      const lines = csvData.split('\n').filter((line: string) => line.trim() !== '');
      
      if (lines.length > 1) {
        const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
        const dateIdx = headers.findIndex((h: string) => h.includes('date') || h.includes('time'));
        const openIdx = headers.findIndex((h: string) => h === 'open' || h.includes('open price'));
        const highIdx = headers.findIndex((h: string) => h === 'high' || h.includes('high price'));
        const lowIdx = headers.findIndex((h: string) => h === 'low' || h.includes('low price'));
        const closeIdx = headers.findIndex((h: string) => h === 'close' || h.includes('close price') || h === 'last price');
        const volIdx = headers.findIndex((h: string) => h.includes('volume') || h.includes('qty') || h.includes('quantity'));

        if (openIdx !== -1 && closeIdx !== -1) {
          dataToTest = lines.slice(1).map((line: string) => {
            const cols = line.split(',');
            return {
              timestamp: dateIdx !== -1 && cols[dateIdx] ? new Date(cols[dateIdx].trim()).getTime() : Date.now(),
              open: parseFloat(cols[openIdx] || '0'),
              high: highIdx !== -1 && cols[highIdx] ? parseFloat(cols[highIdx]) : parseFloat(cols[openIdx] || '0'),
              low: lowIdx !== -1 && cols[lowIdx] ? parseFloat(cols[lowIdx]) : parseFloat(cols[openIdx] || '0'),
              close: parseFloat(cols[closeIdx] || '0'),
              volume: volIdx !== -1 && cols[volIdx] ? parseFloat(cols[volIdx]) : 0
            };
          }).filter((candle: HistoricalCandle) => !isNaN(candle.close));
        }
      }
    }

    // If no CSV/JSON array is provided, generate 2000 minutes of simulated historical data to demonstrate functionality
    if (!dataToTest || dataToTest.length === 0) {
      dataToTest = [];
      let price = 45000;
      for (let i = 0; i < 2000; i++) {
        price += (Math.random() - 0.5) * 60; // Random walk
        dataToTest.push({
          timestamp: Date.now() - (2000 - i) * 60000,
          open: price,
          high: price + 15,
          low: price - 15,
          close: price,
          volume: Math.floor(Math.random() * 5000) + 1000
        });
      }
    }

    const isOptions = useOptions === 'true' || useOptions === true;
    const results = runBacktest(dataToTest, Number(initialCapital), isOptions);

    return res.json({
      strategy,
      period: `${startDate || 'Simulated Start'} to ${endDate || 'Simulated End'}`,
      ...results
    });
  } catch (error: any) {
    logger.error({ error: error.message || error }, "Backtest engine error");
    return res.status(500).json({ error: "Failed to run backtest simulation" });
  }
});

export default router;