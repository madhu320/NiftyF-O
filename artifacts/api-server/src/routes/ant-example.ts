/**
 * EXAMPLE: Using Alice (ANT) Broker Integration
 * Shows how to replace mock orders with real ANT orders
 * 
 * This file demonstrates the integration pattern you should follow
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getAntInstance } from "../../../../lib/ant";
import { ALICE_CONFIG } from "../../../../lib/broker-config";

const router: IRouter = Router();

// Initialize ANT broker instance with credentials
const ant = getAntInstance(ALICE_CONFIG);

/**
 * Get live market data for a symbol from Alice
 */
router.get("/market/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const liveData = await ant.getMarketData(symbol as string);

    if (!liveData) {
      res.status(404).json({
        error: `No market data available for ${symbol}`,
      });
      return;
    }

    res.json({
      success: true,
      symbol,
      ltp: liveData.ltp || 0,
      volume: liveData.volume || 0,
      oi: liveData.oi,
      iv: liveData.iv,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, params: req.params }, "Failed to fetch market data");
    res.status(500).json({ error: "Failed to fetch market data" });
  }
});

/**
 * EXAMPLE 1: Place a real order on Alice Blue
 */
router.post("/order/place", async (req: Request, res: Response) => {
  try {
    const { symbol, quantity, side, orderType, price } = req.body;

    // Place order on Alice Blue
    const result = await ant.placeOrder({
      symbol: symbol as string, // e.g., 'BANKNIFTYOCT24C45000'
      quantity: Number(quantity), // Ensures strict number type
      side: side as "BUY" | "SELL", // 'BUY' | 'SELL'
      orderType: (orderType as "MARKET" | "LIMIT") || 'MARKET', // 'MARKET' | 'LIMIT'
      price: price !== undefined && price !== null ? Number(price) : undefined, // Fix falsy 0 bug for Limit orders
      product: 'MIS', // Intraday
    });

    if (!result) {
      res.status(500).json({ 
        error: "Failed to place order on Alice Blue" 
      });
      return;
    }

    logger.info({
      orderId: result.orderId,
      symbol,
      quantity,
      side,
    }, "Order placed on ANT");

    res.json({
      success: true,
      orderId: result.orderId,
      status: result.status,
      symbol,
      quantity,
      side,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, body: req.body }, "Order placement failed");
    res.status(500).json({ error: "Order placement failed" });
  }
});

/**
 * EXAMPLE 2: Get live positions from Alice
 */
router.get("/positions", async (req: Request, res: Response) => {
  try {
    const positions = await ant.getPositions();

    res.json({
      success: true,
      positions,
      count: positions?.length || 0,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error }, "Failed to fetch positions");
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

/**
 * EXAMPLE 3: Get Greeks for an option from Alice
 */
router.get("/greeks/:symbol/:expiry/:strike/:type", async (req: Request, res: Response) => {
  try {
    const { symbol, expiry, strike, type } = req.params;

    const greeks = await ant.getGreeks(
      symbol as string,
      expiry as string,
      parseInt(strike as string, 10),
      type as "CE" | "PE"
    );

    res.json({
      success: true,
      symbol,
      expiry,
      strike: parseInt(strike as string, 10),
      type,
      greeks,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, params: req.params }, "Failed to fetch Greeks");
    res.status(500).json({ error: "Failed to fetch Greeks" });
  }
});

/**
 * EXAMPLE 4: Get historical data from Alice
 */
router.get("/history/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { fromDate, toDate, resolution } = req.query;
    const now = Math.floor(Date.now() / 1000);
    const from = typeof fromDate === "string" && fromDate ? fromDate : `${now - 2 * 24 * 60 * 60}`;
    const to = typeof toDate === "string" && toDate ? toDate : `${now}`;
    const resolutionStr = typeof resolution === "string" ? resolution : "1";

    const history = await ant.getHistoricalData(symbol as string, from, to, resolutionStr);

    if (!history || (Array.isArray(history) && history.length === 0)) {
      res.status(404).json({
        error: `Historical data not available for ${symbol}`,
      });
      return;
    }

    res.json({
      success: true,
      symbol,
      history,
      fromDate: from,
      toDate: to,
      resolution: resolutionStr,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, params: req.params, query: req.query }, "Failed to fetch historical data");
    res.status(500).json({ error: "Failed to fetch historical data" });
  }
});

/**
 * EXAMPLE 5: Get options chain from Alice
 */
router.get("/options-chain/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { expiry } = req.query;

    const chain = await ant.getOptionsChain(symbol as string, typeof expiry === "string" ? expiry : undefined);

    if (!chain) {
      res.status(404).json({ 
        error: `Options chain not available for ${symbol}` 
      });
      return;
    }

    res.json({
      success: true,
      ...chain,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, symbol: req.params.symbol }, "Failed to fetch options chain");
    res.status(500).json({ error: "Failed to fetch options chain" });
  }
});

/**
 * EXAMPLE 6: Initiate Alice Blue Login (Redirect)
 * Direct users to this route to prompt them to log in via Alice Blue
 */
router.get("/auth/login", (req: Request, res: Response) => {
  
  // Uses your API Key as the appCode to identify your application
  const loginUrl = `https://ant.aliceblueonline.com/?appcode=${ALICE_CONFIG.apiKey}`;
  logger.info({ loginUrl }, "Redirecting to Alice Blue");
  res.redirect(loginUrl);
});

/**
 * DEBUG ROUTE: Verify Config is Loaded (Safe/Masked)
 * Visit /api/ant/auth/debug in your browser to check what keys Render/Node is seeing
 */
router.get("/auth/debug", (req: Request, res: Response) => {
  const mask = (str: string) => 
    (str && str.length > 4 && str !== "YOUR_ALICE_API_KEY" && !str.includes("YOUR_ALICE")) 
      ? `${str.substring(0, 3)}...${str.substring(str.length - 3)}` 
      : str; // Show full string if it's a placeholder so you know it failed to load

  res.json({
    apiKey: mask(ALICE_CONFIG.apiKey),
    apiSecret: mask(ALICE_CONFIG.apiSecret),
    userId: mask(ALICE_CONFIG.userId),
    authCodeConfigured: !!ALICE_CONFIG.authCode,
    enabled: ALICE_CONFIG.enabled,
    redirectUrl: ALICE_CONFIG.frontendRedirectUrl
  });
});

/**
 * EXAMPLE 7: Alice Blue Login Redirect Callback
 * Note: Configure your developer portal Redirect URL to point to this backend route 
 * (e.g., https://api.your-domain.com/api/ant/auth/callback)
 */
router.get("/auth/callback", async (req: Request, res: Response) => {
  try {
    const authCode = (req.query.authCode as string) || (req.query.auth_code as string);

    if (!authCode) {
      res.redirect(`${ALICE_CONFIG.frontendRedirectUrl}?alice_auth=missing_code`);
      return;
    }

    ant.setAuthCode(authCode);
    // Authenticate using the newly received authCode
    const success = await ant.authenticate(authCode);

    if (success) {
      // Redirect back to the production frontend or mobile app
      res.redirect(`${ALICE_CONFIG.frontendRedirectUrl}?alice_auth=success`);
    } else {
      res.redirect(`${ALICE_CONFIG.frontendRedirectUrl}?alice_auth=failed`);
    }
  } catch (error) {
    logger.error({ error }, "Alice Blue callback failed");
    res.redirect(`${ALICE_CONFIG.frontendRedirectUrl}?alice_auth=error`);
  }
});

router.post("/auth/code", async (req: Request, res: Response) => {
  try {
    const { authCode } = req.body;

    if (!authCode || typeof authCode !== "string") {
      res.status(400).json({ error: "authCode is required in the request body" });
      return;
    }

    ant.setAuthCode(authCode);
    const success = await ant.authenticate(authCode);

    if (success) {
      res.json({ success: true, message: "Authentication succeeded" });
    } else {
      res.status(401).json({ success: false, error: "Authentication failed" });
    }
  } catch (error) {
    logger.error({ error, body: req.body }, "Alice Blue auth code exchange failed");
    res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * EXAMPLE 8: Check Authentication Status
 * Verifies if the backend currently holds a valid Alice Blue session token
 */
router.get("/auth/status", (req: Request, res: Response) => {
  const isAuth = ant.isAuthenticated();
  res.json({
    isAuthenticated: isAuth,
    message: isAuth 
      ? "Session is active and ready for trading!" 
      : "No active session. Please log in.",
  });
});

export default router;

/**
 * INTEGRATION CHECKLIST
 * 
 * [ ] 1. Add ANT routes to main app.ts:
 *       import antRoutes from './routes/ant-example';
 *       app.use('/api/ant', antRoutes);
 * 
 * [ ] 2. Set environment variables:
 *       ALICE_API_KEY=...
 *       ALICE_API_SECRET=...
 *       ALICE_USER_ID=...
 *       ALICE_ENABLED=true
 *       ACTIVE_BROKER=alice
 * 
 * [ ] 3. Implement TODO methods in lib/ant.ts:
 *       - authenticate()
 *       - getMarketData()
 *       - getOptionsChain()
 *       - placeOrder()
 *       - subscribeLiveTicks()
 *       - getGreeks()
 * 
 * [ ] 4. Test endpoints:
 *       curl http://localhost:3000/api/ant/market/BANKNIFTY
 *       curl http://localhost:3000/api/ant/positions
 *       curl http://localhost:3000/api/ant/options-chain/BANKNIFTY?expiry=31AUG2024
 * 
 * [ ] 5. Update mobile to use real data:
 *       Replace localhost/api/predict
 *       Replace localhost/api/signals
 *       With: localhost/api/ant/... endpoints
 */
