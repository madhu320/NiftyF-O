import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { generateAndAggregateSignals } from "./signals";
import { checkRiskLimits } from "./risk";
import { db } from "../lib/db";
import * as schema from "../lib/schema";
import { eq, desc } from "drizzle-orm";

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
}

// Mock broker integration - replace with real broker APIs
class HighSpeedExecutionEngine {
  private isConnected: boolean = false;

  async connect(): Promise<boolean> {
    // Simulate broker connection
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
      timestamp: executionOrder.timestamp
    });

    logger.info({ orderId: executionOrder.id }, "Order saved to database [PENDING]");

    // In a live environment, the order status is now updated asynchronously via the broker webhook postback.
    // The initial order state remains 'PENDING' until the webhook confirms 'EXECUTED' or 'REJECTED'.

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
    // Position size limits
    if (order.quantity > 1000) {
      return {
        valid: false,
        reason: "Order size exceeds maximum limit (1000 shares)",
        adjustedQuantity: 1000
      };
    }

    // Price validation for limit orders
    if (order.orderType === 'LIMIT' && !order.price) {
      return {
        valid: false,
        reason: "Limit order must specify price"
      };
    }

    // Circuit breaker checks (mock)
    if (order.symbol.includes('BANKNIFTY') && Math.random() < 0.05) {
      return {
        valid: false,
        reason: "Circuit breaker activated"
      };
    }

    return { valid: true };
  }
}

// Global execution engine instance
const executionEngine = new HighSpeedExecutionEngine();

// Initialize connection on startup
executionEngine.connect().catch(err => {
  logger.error({ err }, "Failed to connect to broker");
});

// Execute algorithmic signal
router.post("/execute-signal", async (req, res) => {
  try {
    const {
      signal,
      positionSize,
      maxSlippage = 0.005, // 0.5% max slippage
      riskMultiplier = 1.0
    } = req.body;

    if (!signal || signal.action === 'HOLD' || !signal.price) {
      return res.json({
        success: false,
        message: "No actionable signal or missing spot price",
        orderId: null
      });
    }

    // Calculate position size based on signal confidence and risk
    const baseQuantity = Math.floor((positionSize * 100000) / 45000); // Assume ~₹45k per lot
    const adjustedQuantity = Math.floor(baseQuantity * riskMultiplier);

    if (adjustedQuantity < 1) {
      return res.json({
        success: false,
        message: "Position size too small for execution",
        orderId: null
      });
    }

    // Determine Options Contract (Strike Selection)
    // We map a BUY (bullish) signal to an ATM Call (CE), and SELL (bearish) to ATM Put (PE)
    const atmStrike = Math.round(signal.price / 100) * 100;
    const optionType = signal.action === 'BUY' ? 'CE' : 'PE';
    const tradableSymbol = `BANKNIFTY${atmStrike}${optionType}`;

    // Create order based on signal
    const orderParams = {
      symbol: tradableSymbol,
      side: 'BUY' as const, // In directional options buying, we always BUY the CE or PE
      quantity: adjustedQuantity,
      orderType: 'MARKET' as const,
      product: 'MIS' as const, // Intraday for algo trading
      exchange: 'NFO' as const
    };

    // Target calculation for F&O: Aiming for 5-7% on the premium/investment
    // If trading Options, 5% return on capital is a ~10-15 point move in Bank Nifty
    const takeProfit = signal.action === 'BUY' ? signal.price * 1.005 : signal.price * 0.995;
    const stopLoss = signal.action === 'BUY' ? signal.price * 0.998 : signal.price * 1.002;

    // Validate order
    const validation = executionEngine.validateOrder(orderParams);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.reason,
        suggestedQuantity: validation.adjustedQuantity
      });
    }

    // Execute order
    const order = await executionEngine.executeOrder(orderParams);

    // Set up automatic stop loss if specified
    if (signal.stopLoss) {
      setTimeout(() => {
        // Mock stop loss order
        logger.info({ orderId: order.id, stopLoss: signal.stopLoss }, "Stop loss triggered");
      }, 5000 + Math.random() * 10000); // 5-15 seconds delay
    }

    res.json({
      success: true,
      orderId: order.id,
      message: `Order to ${orderParams.side} ${orderParams.symbol} (${adjustedQuantity} units) placed. Waiting for webhook confirmation.`,
      execution: {
        quantity: adjustedQuantity,
        estimatedValue: adjustedQuantity * 45000,
        takeProfit,
        stopLoss,
        maxSlippage,
        expectedExecutionTime: "Pending broker postback"
      }
    });

  } catch (error) {
    logger.error({ error }, "Signal execution error");
    res.status(500).json({
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
    const { order_id, status, average_price, transaction_time } = req.body;

    if (!order_id || !status) {
      return res.status(400).json({ error: "Invalid payload: missing order_id or status" });
    }

    const existingOrderResult = await db.select().from(schema.orders).where(eq(schema.orders.id, order_id)).limit(1);
    const existingOrder = existingOrderResult[0];

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
      .where(eq(schema.orders.id, order_id));

    logger.info({ orderId: order_id, status: internalStatus, slippage }, "Order updated via webhook");
    
    res.json({ success: true, message: "Order updated successfully" });
  } catch (error) {
    logger.error({ error }, "Broker webhook processing error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Get execution status
router.get("/order/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const order = await executionEngine.getOrderStatus(orderId);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  res.json({
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

  res.json({
    success: cancelled,
    message: cancelled ? "Order cancelled" : "Could not cancel order"
  });
});

// Get all orders
router.get("/orders", async (req, res) => {
  const orders = await executionEngine.getAllOrders();
  res.json({
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

  res.json({
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

export default router;