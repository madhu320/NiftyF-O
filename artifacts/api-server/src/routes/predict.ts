import { Router, Request, Response } from "express";

const router = Router();
const YAHOO_URL = "https://query2.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?interval=1m&range=1d";

// --- టెక్నికల్ ఇండికేటర్స్ ఫంక్షన్స్ ---
function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calculateEMA(closes: number[], period = 9): number {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes[closes.length - period];
  for (let i = closes.length - period + 1; i < closes.length; i++) {
    ema = (closes[i] - ema) * k + ema;
  }
  return ema;
}

// --- ప్రెడిక్షన్ API రూట్ ---
router.get("/predict", async (req: Request, res: Response) => {
  try {
    const yRes = await fetch(YAHOO_URL, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!yRes.ok) throw new Error(`Yahoo Error: ${yRes.status}`);

    const body = await yRes.json() as any;
    const result = body.chart?.result?.[0];
    if (!result) throw new Error("Empty chart result");

    const currentPrice: number = result.meta?.regularMarketPrice;
    const rawCloses: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const closes = rawCloses.filter((v): v is number => v != null);

    // 1 నిమిషం క్యాండిల్స్ బట్టి గత 3 నిమిషాల ట్రెండ్
    const shortWindow = closes.slice(-3); 
    let priceTrend = "FLAT";
    if (shortWindow.length >= 2) {
      const change = shortWindow[shortWindow.length - 1] - shortWindow[0];
      if (change > 5) priceTrend = "UP";
      if (change < -5) priceTrend = "DOWN";
    }

    const rsi = calculateRSI(closes, 14);
    const ema9 = calculateEMA(closes, 9);

    // Mock ఆప్షన్ చైన్ (AliceBlue కీస్ రాగానే దీన్ని మారుస్తాం)
    const mockOptionChain = {
      callChangeInOI: -150000, 
      putChangeInOI: 450000,   
    };

    const isOIBullish = mockOptionChain.putChangeInOI > mockOptionChain.callChangeInOI || mockOptionChain.callChangeInOI < 0;
    const isOIBearish = mockOptionChain.callChangeInOI > mockOptionChain.putChangeInOI;

    let prediction = "neutral";
    let signalStrength = "Weak";

    if (priceTrend === "UP" && isOIBullish && currentPrice > ema9 && rsi < 70) {
      prediction = "call";
      signalStrength = rsi > 55 ? "Strong" : "Moderate"; 
    } else if (priceTrend === "DOWN" && isOIBearish && currentPrice < ema9 && rsi > 30) {
      prediction = "put";
      signalStrength = rsi < 45 ? "Strong" : "Moderate";
    }

    res.json({ 
      prediction, signalStrength, price: currentPrice, trend: priceTrend,
      indicators: { rsi: parseFloat(rsi.toFixed(2)), ema9: parseFloat(ema9.toFixed(2)) }
    });

  } catch (err) {
    console.error("Predict route error", err);
    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

export default router;