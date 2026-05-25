/**
 * EXAMPLE: Using Alice (ANT) Broker Integration
 * Shows how to replace mock orders with real ANT orders
 * 
 * This file demonstrates the integration pattern you should follow
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { getAntInstance } from "../lib/ant";
import { ALICE_CONFIG } from "../lib/broker-config";

const router: IRouter = Router();

// Initialize ANT broker instance with credentials
const ant = getAntInstance(ALICE_CONFIG);

/**
 * EXAMPLE 1: Place a real order on Alice Blue
 */
router.post("/order/place", async (req, res) => {
  try {
    const { symbol, quantity, side, orderType, price } = req.body;

    // Place order on Alice Blue
    const result = await ant.placeOrder({
      symbol: symbol, // e.g., 'BANKNIFTYOCT24C45000'
      quantity: Number(quantity), // Ensures strict number type
      side: side, // 'BUY' | 'SELL'
      orderType: orderType || 'MARKET', // 'MARKET' | 'LIMIT'
      price: price ? Number(price) : undefined, // Optional for market orders
      product: 'MIS', // Intraday
    });

    if (!result) {
      return res.status(500).json({ 
        error: "Failed to place order on Alice Blue" 
      });
    }

    logger.info({
      orderId: result.orderId,
      symbol,
      quantity,
      side,
    }, "Order placed on ANT");

    return res.json({
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
    return res.status(500).json({ error: "Order placement failed" });
  }
});

/**
 * EXAMPLE 2: Get live positions from Alice
 */
router.get("/positions", async (req, res) => {
  try {
    const positions = await ant.getPositions();

    return res.json({
      success: true,
      positions,
      count: positions?.length || 0,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error }, "Failed to fetch positions");
    return res.status(500).json({ error: "Failed to fetch positions" });
  }
});

/**
 * EXAMPLE 3: Get Greeks for an option from Alice
 */
router.get("/greeks/:symbol/:expiry/:strike/:type", async (req, res) => {
  try {
    const { symbol, expiry, strike, type } = req.params;

    const greeks = await ant.getGreeks(
      symbol,
      expiry,
      parseInt(strike),
      type as "CE" | "PE"
    );

    return res.json({
      success: true,
      symbol,
      expiry,
      strike: parseInt(strike),
      type,
      greeks,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, params: req.params }, "Failed to fetch Greeks");
    return res.status(500).json({ error: "Failed to fetch Greeks" });
  }
});

/**
 * EXAMPLE 4: Get market data from Alice
 */
router.get("/market/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;

    const data = await ant.getMarketData(symbol);

    if (!data) {
      return res.status(404).json({ 
        error: `Market data not available for ${symbol}` 
      });
    }

    return res.json({
      success: true,
      ...data,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, symbol: req.params.symbol }, "Failed to fetch market data");
    return res.status(500).json({ error: "Failed to fetch market data" });
  }
});

/**
 * EXAMPLE 5: Get options chain from Alice
 */
router.get("/options-chain/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { expiry } = req.query;

    const chain = await ant.getOptionsChain(symbol, expiry as string);

    if (!chain) {
      return res.status(404).json({ 
        error: `Options chain not available for ${symbol}` 
      });
    }

    return res.json({
      success: true,
      ...chain,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error, symbol: req.params.symbol }, "Failed to fetch options chain");
    return res.status(500).json({ error: "Failed to fetch options chain" });
  }
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
