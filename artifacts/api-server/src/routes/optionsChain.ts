import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { marketStream } from "../lib/marketDataStream";

const router: IRouter = Router();

// ── Black-Scholes helpers ─────────────────────────────────────────────────────

/** Cumulative standard normal CDF (Abramowitz & Stegun approximation, max error 7.5e-8) */
function normCDF(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * ax);
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const y = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * ax * ax) * poly;
  return 0.5 + sign * (y - 0.5);
}

function bsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "ce" | "pe",
): number {
  if (T <= 0) return type === "ce" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === "ce") {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  }
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

/** Implied volatility — use a simple smile: higher for deep OTM/ITM */
function smileIV(moneyness: number, baseIV: number): number {
  // moneyness = (strike - spot) / spot
  const skew = 0.08 * moneyness * moneyness + 0.02 * Math.abs(moneyness);
  return Math.max(0.10, Math.min(0.60, baseIV + skew));
}

// ── Deterministic pseudo-random (for stable OI without external data) ─────────
// Uses a simple mulberry32 seeded by the strike price so OI is consistent
// across requests but looks organic.
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

function modelOI(
  strike: number,
  spot: number,
  side: "ce" | "pe",
): number {
  const rand = seededRand(strike + (side === "ce" ? 0 : 999_999));
  const noise = 0.75 + rand() * 0.5; // 0.75 – 1.25

  const offset = (strike - spot) / spot; // fractional distance

  // OI peaks slightly OTM for each side (empirical pattern)
  const peakOffset = side === "ce" ? 0.01 : -0.01; // 1% OTM
  const dist = Math.abs(offset - peakOffset);

  // Exponential decay from peak, scale ~2-4 million at ATM, less further out
  const peak = 4_000_000;
  const decay = 60; // controls how fast OI drops with distance
  const oi = peak * Math.exp(-decay * dist * dist) * noise;

  return Math.max(0, Math.round(oi / 100) * 100);
}

// ── Expiry calculation (Bank Nifty → weekly Wednesdays) ───────────────────────

function nextExpiryDate(): { label: string; T: number } {
  const nowUtc = Date.now();
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(nowUtc + IST_OFFSET_MS);

  const day = ist.getUTCDay(); // 0=Sun … 6=Sat; 3=Wed
  let daysUntil = (3 - day + 7) % 7;

  if (daysUntil === 0) {
    const pastClose =
      ist.getUTCHours() > 15 ||
      (ist.getUTCHours() === 15 && ist.getUTCMinutes() >= 30);
    if (pastClose) daysUntil = 7;
  }

  const expiryMs = nowUtc + IST_OFFSET_MS + daysUntil * 86_400_000;
  const expiry = new Date(expiryMs);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const label = `${String(expiry.getUTCDate()).padStart(2, "0")}-${MONTHS[expiry.getUTCMonth()]}-${expiry.getUTCFullYear()}`;

  // Time to expiry in years (market closes at 15:30 IST on expiry day)
  const expiryCloseMs =
    expiryMs + (15 * 60 + 30 - (5 * 60 + 30)) * 60_000; // 15:30 IST → UTC
  const T = Math.max(0, (expiryCloseMs - nowUtc) / (365 * 86_400_000));

  return { label, T };
}

// ── Spot price via Live WebSocket ─────────────────────────────────────────────

async function fetchSpot(): Promise<number> {
  const price = marketStream.getLatestPrice('BANKNIFTY');
  if (!price) throw new Error("No live spot price available from WebSocket");
  return price;
}

// ── In-memory cache (60 s TTL) ────────────────────────────────────────────────

interface ChainCache {
  data: object;
  ts: number;
}
let cache: ChainCache | null = null;
const TTL = 1000; // 1-second cache to strictly match the WebSocket stream tick rate

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/options-chain", async (req, res) => {
  try {
    if (cache && Date.now() - cache.ts < TTL) {
      res.setHeader("X-Cache", "HIT");
      res.json(cache.data);
      return;
    }

    const spot = await fetchSpot();
    const { label: expiry, T } = nextExpiryDate();

    // Round spot to nearest 100 to find ATM strike
    const atmStrike = Math.round(spot / 100) * 100;

    // ±15 strikes in 100-point intervals = 31 rows
    const HALF = 15;
    const RISK_FREE = 0.065; // 6.5% RBI repo rate

    // Estimate base IV from time-to-expiry (higher IV when < 1 day to expiry)
    const baseIV = T < 1 / 365 ? 0.22 : T < 3 / 365 ? 0.20 : 0.18;

    const strikes = [];
    const symbolsToSubscribe: string[] = [];

    for (let i = -HALF; i <= HALF; i++) {
      const K = atmStrike + i * 100;
      const moneyness = (K - spot) / spot;
      const iv = smileIV(moneyness, baseIV);

      // Generate contract symbols (e.g., BANKNIFTY24MAY202645000CE)
      const ceSymbol = `BANKNIFTY${expiry.replace(/-/g, '').toUpperCase()}${K}CE`;
      const peSymbol = `BANKNIFTY${expiry.replace(/-/g, '').toUpperCase()}${K}PE`;
      
      symbolsToSubscribe.push(ceSymbol, peSymbol);

      // Fetch from live WebSocket if available, otherwise fallback to theoretical model
      const ceOi = marketStream.getLatestOI(ceSymbol) || modelOI(K, spot, "ce");
      const peOi = marketStream.getLatestOI(peSymbol) || modelOI(K, spot, "pe");
      
      const ceLtp = marketStream.getLatestPrice(ceSymbol) || bsPrice(spot, K, T, RISK_FREE, iv, "ce");
      const peLtp = marketStream.getLatestPrice(peSymbol) || bsPrice(spot, K, T, RISK_FREE, iv, "pe");

      strikes.push({
        strike: K,
        ce: {
          symbol: ceSymbol,
          oi: ceOi,
          volume: marketStream.getLatestVolume(ceSymbol) || Math.round(ceOi * 0.12 / 100) * 100,
          ltp: Math.round(ceLtp * 20) / 20, // round to nearest 0.05
          iv: Math.round(iv * 1000) / 10,  // e.g. 18.4
        },
        pe: {
          symbol: peSymbol,
          oi: peOi,
          volume: marketStream.getLatestVolume(peSymbol) || Math.round(peOi * 0.10 / 100) * 100,
          ltp: Math.round(peLtp * 20) / 20,
          iv: Math.round(iv * 1000) / 10,
        },
      });
    }

    // Instruct the WebSocket stream to listen to these active strikes
    marketStream.subscribe(symbolsToSubscribe);

    const payload = { expiry, spot, strikes, theoretical: true };
    cache = { data: payload, ts: Date.now() };
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    logger.error({ err }, "options-chain route error");
    res.status(502).json({ error: "Failed to compute options chain" });
  }
});

export default router;
