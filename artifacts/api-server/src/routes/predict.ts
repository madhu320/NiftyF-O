import { Router, type IRouter } from "express";

const router: IRouter = Router();

const YAHOO_URL =
  "https://query2.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?interval=1m&range=1d";

router.get("/predict", async (req, res) => {
  try {
    const yRes = await fetch(YAHOO_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NiftyBankBot/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!yRes.ok) {
      throw new Error(`Yahoo Finance responded with ${yRes.status}`);
    }

    const body = (await yRes.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
        error?: unknown;
      };
    };

    const result = body.chart?.result?.[0];
    if (!result) throw new Error("Empty chart result from Yahoo Finance");

    const price: number =
      result.meta?.regularMarketPrice ??
      (() => {
        throw new Error("No regularMarketPrice in response");
      })();

    const rawCloses: (number | null)[] =
      result.indicators?.quote?.[0]?.close ?? [];
    const closes = rawCloses.filter((v): v is number => v != null);

    // Use last 10 candles for momentum; fall back to neutral if not enough data
    const window = closes.slice(-3);
    let sentiment = 50;
    if (window.length >= 2) {
      const pctChange =
        ((window[window.length - 1] - window[0]) / window[0]) * 100;
      // Map [-2%, +2%] → [0, 100]
      sentiment = Math.round(Math.min(100, Math.max(0, 50 + pctChange * 25)));
    }

    const prediction = sentiment >= 50 ? "call" : "put";

    res.json({ prediction, price, sentiment });
  } catch (err) {
    req.log.error({ err }, "predict route error");
    res.status(502).json({ error: "Failed to fetch market data" });
  }
});

export default router;
