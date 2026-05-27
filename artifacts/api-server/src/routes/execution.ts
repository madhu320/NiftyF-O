import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { generateAndAggregateSignals } from "./signals";
import { checkRiskLimits } from "./risk";
import { db } from "../lib/db";
import * as schema from "../lib/schema";
import { eq, desc } from "drizzle-orm";
import { getAntInstance, type AntIntegration } from "../../../../lib/ant";
import { ALICE_CONFIG } from "../../../../lib/broker-config";
const router: IRouter = Router();

// High-speed execution engine for algorithmic trading
interface ExecutionOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  product: 'CNC' | 'MIS' | 'NRML';
  exchange: 'NSE' | 'NFO';
  timestamp: number;
  status: 'PENDING' | 'EXECUTED' | 'REJECTED' | 'CANCELLED';
  executionTime?: number;
  slippage?: number;
  brokerOrderId?: string;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  stopLossPercentage?: number;
  takeProfitPercentage?: number;
}

// Mock broker integration - replace with real broker APIs
class HighSpeedExecutionEngine {
  private isConnected: boolean = false;

  async connect(): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 100));
    this.isConnected = true;
    logger.info("Connected to broker API");
    return true;
  }

  async executeOrder(order: Omit<ExecutionOrder, 'id' | 'timestamp' | 'status'>): Promise<ExecutionOrder> {
    if (!this.isConnected) {
      throw new Error("Not connected to broker");
    }

    const executionOrder: ExecutionOrder = {
      ...order,
      id: `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      status: 'PENDING'
    };

    // Save order to database
    await db.insert(schema.orders).values({
      id: executionOrder.id,
      symbol: executionOrder.symbol,
      side: executionOrder.side,
      quantity: executionOrder.quantity,
      price: executionOrder.price ?? null,
      orderType: executionOrder.orderType,
      product: executionOrder.product,
      exchange: executionOrder.exchange,
      status: executionOrder.status,
      brokerOrderId: executionOrder.brokerOrderId ?? null,
      stopLossPrice: executionOrder.stopLossPrice ?? null,
      takeProfitPrice: executionOrder.takeProfitPrice ?? null,
      stopLossPercentage: executionOrder.stopLossPercentage ?? null,
      takeProfitPercentage: executionOrder.takeProfitPercentage ?? null,
      executionTime: null,
      slippage: null,
      timestamp: executionOrder.timestamp
    });

    logger.info({ orderId: executionOrder.id }, "Order saved to database [PENDING]");

    return executionOrder;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    await db.update(schema.orders)
      .set({ status: 'CANCELLED' })
      .where(eq(schema.orders.id, orderId));
    logger.info({ orderId }, "Order cancelled in database");
    return true;
  }

  async getOrderStatus(orderId: string): Promise<ExecutionOrder | null> {
    const result = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
    return (result[0] as ExecutionOrder) || null;
  }

  async getAllOrders(): Promise<ExecutionOrder[]> {
    const result = await db.select().from(schema.orders).orderBy(desc(schema.orders.timestamp));
    return result as ExecutionOrder[];
  }

  // Risk management checks
  validateOrder(order: Omit<ExecutionOrder, 'id' | 'timestamp' | 'status'>): {
    valid: boolean;
    reason?: string;
    adjustedQuantity?: number;
  } {
    if (order.quantity > 5000) {
      return { valid: false, reason: "Order size exceeds maximum limit (5000 units)", adjustedQuantity: 5000 };
    }

    if (order.orderType === 'LIMIT' && !order.price) {
      return { valid: false, reason: "Limit order must specify price" };
    }

    if (order.symbol.includes('BANKNIFTY') && Math.random() < 0.02) {
      return { valid: false, reason: "Simulated circuit breaker" };
    }

    return { valid: true };
  }
}

// In-memory map for managed positions
const managedPositions = new Map<string, {
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}>();


// Global execution engine instance
const executionEngine = new HighSpeedExecutionEngine();

// Initialize connection on startup
executionEngine.connect().catch(err => {
  logger.error({ err }, "Failed to connect to broker");
});

/**
 * Starts active monitoring of a position for Take Profit and Stop Loss.
 * This is typically called from the webhook once a BUY order is confirmed as EXECUTED.
 */
function startManagingPosition(
  orderId: string,
  symbol: string,
  quantity: number,
  entryPrice: number,
  stopLossPercentage: number,
  takeProfitPercentage: number
) {
  // Prevent duplicate management
  if (managedPositions.has(orderId)) {
    logger.warn({ orderId }, "Position is already being managed.");
    return;
  }

  const stopLossPrice = entryPrice * (1 - stopLossPercentage / 100);
  const takeProfitPrice = entryPrice * (1 + takeProfitPercentage / 100);

  managedPositions.set(orderId, {
    symbol,
    quantity,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
  });

  logger.info(
    { orderId, symbol, entryPrice, stopLossPrice, takeProfitPrice },
    "Started managing position for SL/TP."
  );
}

/**
 * Periodically checks all managed positions against live market data
 * and places a SELL order if SL or TP levels are breached.
 */
async function checkManagedPositions() {
  if (managedPositions.size === 0) {
    return; // No positions to check
  }
  const ant = getAntInstance(ALICE_CONFIG); // Get existing instance

  for (const [orderId, position] of managedPositions.entries()) {
    try {
      const marketData = await ant.getMarketData(position.symbol);
      if (!marketData || !marketData.ltp) {
        logger.warn({ symbol: position.symbol }, "Could not fetch LTP for managed position.");
        continue;
      }

      const ltp = marketData.ltp;
      let exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | null = null;

      if (ltp <= position.stopLossPrice) exitReason = 'STOP_LOSS';
      else if (ltp >= position.takeProfitPrice) exitReason = 'TAKE_PROFIT';

      if (exitReason) {
        logger.info({ orderId, symbol: position.symbol, ltp, exitReason, sl: position.stopLossPrice, tp: position.takeProfitPrice }, `Exit condition met. Placing SELL order.`);
        const brokerResult = await ant.placeOrder({ symbol: position.symbol, quantity: position.quantity, side: "SELL", orderType: "MARKET", product: "MIS" });
        if (brokerResult) {
          logger.info({ orderId: brokerResult.orderId, parentOrderId: orderId }, "Exit order placed successfully.");
          managedPositions.delete(orderId);
        } else logger.error({ parentOrderId: orderId, symbol: position.symbol }, "Failed to place exit order.");
      }
    } catch (error) {
      logger.error({ error, orderId, symbol: position.symbol }, "Error checking managed position.");
    }
  }
}

async function syncAlicePositions(ant: AntIntegration): Promise<void> {
  try {
    const positions = await ant.getPositions();
    if (!Array.isArray(positions) || positions.length === 0) {
      logger.debug("No positions returned from Alice Blue to sync");
      return;
    }

    for (const position of positions as any[]) {
      if (!position.symbol) continue;
      const symbol = position.symbol;
      const quantity = Number(position.qty ?? position.quantity ?? 0);
      const avgPrice = Number(position.avgPrice ?? position.avg_price ?? 0);
      const currentPrice = Number(position.ltp ?? position.currentPrice ?? 0);
      const unrealizedPnL = Number(position.unrealizedPnL ?? position.unrealized_pnl ?? 0);
      const realizedPnL = Number(position.realizedPnL ?? position.realized_pnl ?? 0);
      const marketValue = quantity * currentPrice;

      const result = await db.select().from(schema.positions).where(eq(schema.positions.symbol, symbol)).limit(1);
      if (result.length > 0) {
        await db.update(schema.positions).set({
          quantity,
          avgPrice,
          currentPrice,
          unrealizedPnL,
          realizedPnL,
          marketValue,
          timestamp: Date.now()
        }).where(eq(schema.positions.symbol, symbol));
      } else {
        await db.insert(schema.positions).values({
          symbol,
          quantity,
          avgPrice,
          currentPrice,
          unrealizedPnL,
          realizedPnL,
          marketValue,
          timestamp: Date.now()
        });
      }
    }

    logger.info("Alice Blue account positions synced to local portfolio");
  } catch (error) {
    logger.warn({ error }, "Failed to sync Alice Blue positions");
  }
}

async function getAliceMarginInfo(ant: AntIntegration) {
  const marginInfo = await ant.getMarginInfo();
  return marginInfo ?? {
    availableMargin: 0,
    usedMargin: 0,
    totalMargin: 0,
    marginUtilization: 1,
    cashBalance: 0,
    timestamp: Date.now(),
  };
}

// Execute algorithmic signal
router.post("/execute-signal", async (req, res) => {
  try {
    const ant = getAntInstance(ALICE_CONFIG);
    await syncAlicePositions(ant);

    const {
      signal,
      investmentAmount, // NEW: Total amount to invest
      takeProfitPercentage, // NEW: e.g., 20 for 20%
      stopLossPercentage, // NEW: e.g., 10 for 10%
    } = req.body;

    if (!investmentAmount || !takeProfitPercentage || !stopLossPercentage) {
      return res.status(400).json({ success: false, message: "Missing required fields: investmentAmount, takeProfitPercentage, stopLossPercentage" });
    }

    if (!signal || signal.action === 'HOLD' || !signal.price) {
      return res.json({
        success: false,
        message: "No actionable signal or missing spot price",
        orderId: null
      });
    }

    const marginInfo = await getAliceMarginInfo(ant);
    if (marginInfo.availableMargin < investmentAmount) {
      const requiredMargin = investmentAmount;
      return res.status(402).json({
        success: false,
        message: `Margin insufficient. Required ~₹${requiredMargin.toLocaleString()}, available ₹${marginInfo.availableMargin.toLocaleString()}`,
        marginInfo
      });
    }

    if (marginInfo.marginUtilization >= 0.85) {
      return res.status(403).json({
        success: false,
        message: "Margin utilization is too high to open new positions. Wait for free margin to refresh.",
        marginInfo
      });
    }

    // Determine Options Contract (ATM)
    const atmStrike = Math.round(signal.price / 100) * 100;
    const optionType = signal.action === 'BUY' ? 'CE' : 'PE';
    const tradableSymbol = `BANKNIFTY${atmStrike}${optionType}`;

    // Fetch live option price to calculate quantity
    const optionMarketData = await ant.getMarketData(tradableSymbol);
    if (!optionMarketData || !optionMarketData.ltp) {
      return res.status(500).json({ success: false, message: `Could not fetch live price for option ${tradableSymbol}` });
    }
    const optionPrice = optionMarketData.ltp;
    const lotSize = 15; // Bank Nifty lot size
    const numLots = Math.floor(investmentAmount / (optionPrice * lotSize));

    if (numLots < 1) {
      return res.json({ success: false, message: `Investment amount ₹${investmentAmount.toLocaleString()} is too small to buy even one lot at current premium of ₹${optionPrice.toFixed(2)}.`, orderId: null });
    }
    const quantity = numLots * lotSize;

    // Create order parameters
    const orderParams = {
      symbol: tradableSymbol,
      side: 'BUY' as const, // In directional options buying, we always BUY the CE or PE
      quantity: quantity,
      orderType: 'MARKET' as const,
      product: 'MIS' as const, // Intraday for algo trading
      exchange: 'NFO' as const,
      takeProfitPercentage: Number(takeProfitPercentage),
      stopLossPercentage: Number(stopLossPercentage),
    };

    // Validate order against engine limits (e.g., max quantity)
    const validation = executionEngine.validateOrder(orderParams);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.reason,
        suggestedQuantity: validation.adjustedQuantity
      });
    }

    // Place order through Alice Blue
    const brokerResult = await ant.placeOrder({
      symbol: orderParams.symbol,
      quantity: orderParams.quantity,
      side: orderParams.side,
      orderType: orderParams.orderType,
      product: orderParams.product,
    });

    if (!brokerResult || !brokerResult.orderId) {
      return res.status(500).json({
        success: false,
        message: "Failed to place order on Alice Blue or did not receive orderId",
      });
    }

    // Augment order params with broker and SL/TP fields
    const enrichedOrderParams = {
      ...orderParams,
      price: optionPrice,
      brokerOrderId: brokerResult.orderId,
      stopLossPrice: optionPrice * (1 - Number(stopLossPercentage) / 100),
      takeProfitPrice: optionPrice * (1 + Number(takeProfitPercentage) / 100),
      stopLossPercentage: Number(stopLossPercentage),
      takeProfitPercentage: Number(takeProfitPercentage)
    };

    // Create internal execution order record (internal id generated by engine)
    const order = await executionEngine.executeOrder(enrichedOrderParams);

    // Start managing SL/TP immediately using estimated entry premium
    try {
      startManagingPosition(order.id, orderParams.symbol, orderParams.quantity, optionPrice, Number(stopLossPercentage), Number(takeProfitPercentage));
    } catch (e) {
      logger.warn({ e, orderId: order.id }, "Failed to start position management (non-fatal)");
    }

    return res.json({
      success: true,
      orderId: order.id,
      message: `Order to ${orderParams.side} ${orderParams.quantity} units of ${orderParams.symbol} placed. SL/TP will be managed upon execution.`,
      execution: {
        quantity: orderParams.quantity,
        estimatedValue: quantity * optionPrice,
        takeProfitPercentage: orderParams.takeProfitPercentage,
        stopLossPercentage: orderParams.stopLossPercentage,
        expectedExecutionTime: "Pending broker postback"
      }
    });

  } catch (error) {
    logger.error({ error }, "Signal execution error");
    return res.status(500).json({
      success: false,
      message: "Execution failed",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Broker Postback / Webhook Endpoint for real-time order updates
router.post("/webhook/broker", async (req, res) => {
  try {
    // Example payload from a broker (like Zerodha or Upstox)
    // Note: In production, you must verify a webhook signature (e.g., HMAC-SHA256) to ensure it's actually from the broker
    const { order_id, status, average_price, transaction_time, quantity, symbol } = req.body;

    if (!order_id || !status) {
      return res.status(400).json({ error: "Invalid payload: missing order_id or status" });
    }

    const existingOrderResult = await db.select().from(schema.orders).where(eq(schema.orders.brokerOrderId, order_id)).limit(1);
    const existingOrder = existingOrderResult[0] as (ExecutionOrder | undefined);

    if (!existingOrder) {
      logger.warn({ order_id }, "Received webhook for unknown order");
      return res.status(404).json({ error: "Order not found" });
    }

    // Map broker status to our internal status (EXECUTED, REJECTED, CANCELLED)
    let internalStatus: 'PENDING' | 'EXECUTED' | 'REJECTED' | 'CANCELLED' = 'PENDING';
    if (status.toUpperCase() === 'COMPLETE' || status.toUpperCase() === 'EXECUTED') internalStatus = 'EXECUTED';
    else if (status.toUpperCase() === 'REJECTED') internalStatus = 'REJECTED';
    else if (status.toUpperCase() === 'CANCELLED') internalStatus = 'CANCELLED';
    
    // Calculate slippage if executed
    let slippage = 0;
    if (internalStatus === 'EXECUTED' && existingOrder.price && average_price) {
      slippage = (average_price - existingOrder.price) / existingOrder.price;
    }

    const executionTime = transaction_time ? new Date(transaction_time).getTime() : Date.now();

    await db.update(schema.orders)
      .set({ status: internalStatus, executionTime, slippage, price: average_price || existingOrder.price })
      .where(eq(schema.orders.brokerOrderId, order_id));

    logger.info({ orderId: order_id, status: internalStatus, slippage }, "Order updated via webhook");
    
    // If a BUY order was successfully executed, and it has SL/TP info, start managing it.
    if (
      internalStatus === 'EXECUTED' &&
      existingOrder.side === 'BUY' &&
      existingOrder.takeProfitPercentage != null &&
      existingOrder.stopLossPercentage != null
    ) {
      startManagingPosition(
        existingOrder.id,
        existingOrder.symbol,
        existingOrder.quantity,
        average_price, // The actual executed price
        existingOrder.stopLossPercentage,
        existingOrder.takeProfitPercentage
      );
    }
    
    return res.json({ success: true, message: "Order updated successfully" });
  } catch (error) {
    logger.error({ error }, "Broker webhook processing error");
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Get execution status
router.get("/order/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const order = await executionEngine.getOrderStatus(orderId);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  return res.json({
    orderId: order.id,
    status: order.status,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    executionTime: order.executionTime,
    slippage: order.slippage,
    timestamp: order.timestamp
  });
});

// Cancel order
router.delete("/order/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const cancelled = await executionEngine.cancelOrder(orderId);

  return res.json({
    success: cancelled,
    message: cancelled ? "Order cancelled" : "Could not cancel order"
  });
});

// Get all orders
router.get("/orders", async (req, res) => {
  const orders = await executionEngine.getAllOrders();
  return res.json({
    orders: orders.slice(-50), // Last 50 orders
    total: orders.length
  });
});

// Performance metrics
router.get("/performance", async (req, res) => {
  const orders = await executionEngine.getAllOrders();
  const executedOrders = orders.filter(o => o.status === 'EXECUTED');

  const totalTrades = executedOrders.length;
  const winningTrades = executedOrders.filter(o => (o.slippage || 0) < 0.002).length;
  const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

  const avgExecutionTime = executedOrders.length > 0
    ? executedOrders.reduce((sum, o) => sum + ((o.executionTime || 0) - o.timestamp), 0) / executedOrders.length
    : 0;

  const avgSlippage = executedOrders.length > 0
    ? executedOrders.reduce((sum, o) => sum + (o.slippage || 0), 0) / executedOrders.length
    : 0;

  return res.json({
    metrics: {
      totalTrades,
      winRate,
      avgExecutionTimeMs: Math.round(avgExecutionTime),
      avgSlippagePercent: (avgSlippage * 100).toFixed(3),
      successRate: executedOrders.length / orders.length,
      lastUpdated: Date.now()
    },
    recentTrades: executedOrders.slice(-10)
  });
});


// ─── Automated Trading Bot ───────────────────────────────────────────────────

async function runTradingBot() {
  try {
    logger.info('Bot is running, fetching signals...');
    // 1. Fetch AI Analysis & Signals
    const { marketData, finalSignal } = await generateAndAggregateSignals();

    // 2. Determine Action & Confidence Threshold
    if (finalSignal.action === 'HOLD' || finalSignal.confidence < 65) { // e.g. 65% confidence threshold
      logger.info({ action: finalSignal.action, confidence: finalSignal.confidence }, 'Bot holding position.');
      return;
    }

    logger.info({ signal: finalSignal }, 'Actionable signal received by bot');

    // 3. Find the right contract (e.g., BANKNIFTY 45000 CE)
    const atmStrike = Math.round(marketData.bankNifty / 100) * 100;
    const optionType = finalSignal.action === 'BUY' ? 'CE' : 'PE';
    const tradableSymbol = `BANKNIFTY${atmStrike}${optionType}`;

    const lotSize = 15; // Bank Nifty lot size

    // 4. Validate Risk limits via risk.ts logic
    const riskCheck = await checkRiskLimits({
      symbol: tradableSymbol,
      quantity: lotSize,
      price: marketData.bankNifty, // Using spot for risk calculation, option premium would be more accurate
      side: 'BUY' // We are buying an option, so the side for risk is BUY
    });

    // 5. Execute
    if (riskCheck.allowed) {
      logger.info({ symbol: tradableSymbol, quantity: lotSize }, 'Automated bot executing trade');
      await executionEngine.executeOrder({
        symbol: tradableSymbol,
        side: 'BUY', // We always BUY the option contract in this strategy
        quantity: riskCheck.adjustedQuantity || lotSize,
        orderType: 'MARKET',
        product: 'MIS',
        exchange: 'NFO'
      });
    } else {
      logger.warn({ reason: riskCheck.reason }, 'Automated trade blocked by risk management');
    }
  } catch (error) {
    logger.error({ error }, "Error in automated trading bot loop");
  }
}

// Run the bot every 1 minute.
// NOTE: In a real-world scenario, consider market hours and more robust scheduling.
const botInterval = 60 * 1000;
setInterval(runTradingBot, botInterval);
logger.info(`Automated trading bot scheduled to run every ${botInterval / 1000} seconds.`);

// Run the position monitor to check for SL/TP exits.
const monitorInterval = 5000; // 5 seconds
setInterval(checkManagedPositions, monitorInterval);
logger.info(`Position monitor scheduled to run every ${monitorInterval / 1000} seconds.`);


export default router;