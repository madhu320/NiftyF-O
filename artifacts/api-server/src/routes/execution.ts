import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

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
  private orders: Map<string, ExecutionOrder> = new Map();
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

    // Simulate ultra-fast execution (50-200ms typical for algo trading)
    const executionDelay = 50 + Math.random() * 150;

    setTimeout(() => {
      const slippage = (Math.random() - 0.5) * 0.002; // ±0.2% slippage
      executionOrder.status = 'EXECUTED';
      executionOrder.executionTime = Date.now();
      executionOrder.slippage = slippage;
      logger.info({ order: executionOrder }, "Order executed");
    }, executionDelay);

    this.orders.set(executionOrder.id, executionOrder);
    return executionOrder;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'PENDING') {
      return false;
    }

    order.status = 'CANCELLED';
    logger.info({ orderId }, "Order cancelled");
    return true;
  }

  getOrderStatus(orderId: string): ExecutionOrder | null {
    return this.orders.get(orderId) || null;
  }

  getAllOrders(): ExecutionOrder[] {
    return Array.from(this.orders.values());
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

    if (!signal || signal.action === 'HOLD') {
      return res.json({
        success: false,
        message: "No actionable signal",
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

    // Create order based on signal
    const orderParams = {
      symbol: "BANKNIFTY",
      side: signal.action as 'BUY' | 'SELL',
      quantity: adjustedQuantity,
      orderType: 'MARKET' as const,
      product: 'MIS' as const, // Intraday for algo trading
      exchange: 'NFO' as const
    };

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
      message: `Order ${signal.action} ${adjustedQuantity} lots executed`,
      execution: {
        quantity: adjustedQuantity,
        estimatedValue: adjustedQuantity * 45000,
        maxSlippage,
        expectedExecutionTime: "50-200ms"
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

// Get execution status
router.get("/order/:orderId", (req, res) => {
  const { orderId } = req.params;
  const order = executionEngine.getOrderStatus(orderId);

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
router.get("/orders", (req, res) => {
  const orders = executionEngine.getAllOrders();
  res.json({
    orders: orders.slice(-50), // Last 50 orders
    total: orders.length
  });
});

// Performance metrics
router.get("/performance", (req, res) => {
  const orders = executionEngine.getAllOrders();
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

export default router;