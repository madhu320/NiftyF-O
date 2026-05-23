import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { db } from "../lib/db";
import * as schema from "../lib/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Portfolio and risk management system
interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  marketValue: number;
  timestamp: number;
}

interface RiskMetrics {
  portfolioValue: number;
  dailyPnL: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;
  winRate: number;
  avgTradeSize: number;
  concentrationRisk: number; // Largest position % of portfolio
  marginUtilization: number;
  var95: number; // Value at Risk 95%
}

interface RiskLimits {
  maxPortfolioRisk: number; // Max % loss allowed
  maxDrawdownLimit: number; // Max drawdown before stopping
  maxPositionSize: number; // Max % of portfolio per position
  maxDailyLoss: number; // Max daily loss
  maxConcentration: number; // Max concentration in single asset
  minMarginBuffer: number; // Minimum margin buffer
}

// Fetch portfolio data from database
export async function getPortfolio(): Promise<Position[]> {
  const positions = await db.select().from(schema.positions);
  return positions as Position[];
}

let riskLimits: RiskLimits = {
  maxPortfolioRisk: 0.05, // 5%
  maxDrawdownLimit: 0.08, // 8%
  maxPositionSize: 0.20, // 20%
  maxDailyLoss: 0.03, // 3%
  maxConcentration: 0.30, // 30%
  minMarginBuffer: 0.25 // 25%
};

// Calculate comprehensive risk metrics
function calculateRiskMetrics(positions: Position[]): RiskMetrics {
  const portfolioValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
  const totalPnL = positions.reduce((sum, pos) => sum + pos.realizedPnL + pos.unrealizedPnL, 0);
  const dailyPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);

  // Calculate drawdown (simplified)
  const maxDrawdown = 0.06; // Mock value

  // Calculate Sharpe ratio (simplified)
  const volatility = 0.18; // 18% annualized volatility
  const riskFreeRate = 0.065; // 6.5% RBI rate
  const sharpeRatio = (totalPnL / portfolioValue - riskFreeRate) / volatility;

  // Calculate win rate (simplified)
  const winRate = 0.62; // 62% win rate

  // Calculate concentration risk
  const largestPosition = Math.max(...positions.map(p => p.marketValue));
  const concentrationRisk = largestPosition / portfolioValue;

  // Calculate average trade size
  const avgTradeSize = portfolioValue / positions.length;

  // Calculate margin utilization (simplified)
  const marginUtilization = 0.45; // 45% margin used

  // Calculate VaR (simplified)
  const var95 = portfolioValue * volatility * 1.645; // 95% confidence

  return {
    portfolioValue,
    dailyPnL,
    totalPnL,
    maxDrawdown,
    sharpeRatio,
    volatility,
    winRate,
    avgTradeSize,
    concentrationRisk,
    marginUtilization,
    var95
  };
}

// Check if trade violates risk limits
export async function checkRiskLimits(
  newTrade: { symbol: string; quantity: number; price: number; side: 'BUY' | 'SELL' }
): Promise<{ allowed: boolean; reason?: string; adjustedQuantity?: number }> {
  
  const positions = await getPortfolio();

  const currentMetrics = calculateRiskMetrics(positions);
  const newPositionValue = newTrade.quantity * newTrade.price;
  const newPortfolioValue = currentMetrics.portfolioValue + (newTrade.side === 'BUY' ? newPositionValue : -newPositionValue);

  // Check position size limit
  const positionSizePercent = newPositionValue / newPortfolioValue;
  if (positionSizePercent > riskLimits.maxPositionSize) {
    const maxQuantity = Math.floor((riskLimits.maxPositionSize * newPortfolioValue) / newTrade.price);
    return {
      allowed: false,
      reason: `Position size ${positionSizePercent.toFixed(2)}% exceeds limit ${riskLimits.maxPositionSize.toFixed(2)}%`,
      adjustedQuantity: maxQuantity
    };
  }

  // Check concentration risk
  const existingPosition = positions.find(p => p.symbol === newTrade.symbol);
  const totalPositionValue = (existingPosition?.marketValue || 0) +
    (newTrade.side === 'BUY' ? newPositionValue : -newPositionValue);
  const concentrationPercent = totalPositionValue / newPortfolioValue;

  if (concentrationPercent > riskLimits.maxConcentration) {
    const maxAdditionalValue = riskLimits.maxConcentration * newPortfolioValue - (existingPosition?.marketValue || 0);
    const maxQuantity = newTrade.side === 'BUY' ?
      Math.floor(maxAdditionalValue / newTrade.price) :
      Math.floor((existingPosition?.quantity || 0) * (maxAdditionalValue / (existingPosition?.marketValue || 1)));

    return {
      allowed: false,
      reason: `Concentration ${concentrationPercent.toFixed(2)}% exceeds limit ${riskLimits.maxConcentration.toFixed(2)}%`,
      adjustedQuantity: Math.max(0, maxQuantity)
    };
  }

  // Check daily loss limit
  const potentialLoss = newTrade.side === 'SELL' ? newPositionValue * 0.02 : 0; // Assume 2% potential loss
  if (currentMetrics.dailyPnL - potentialLoss < -riskLimits.maxDailyLoss * currentMetrics.portfolioValue) {
    return {
      allowed: false,
      reason: `Trade would exceed daily loss limit of ${riskLimits.maxDailyLoss.toFixed(2)}%`
    };
  }

  return { allowed: true };
}

// Get portfolio overview
router.get("/portfolio", async (req, res) => {
  const portfolio = await getPortfolio();
  const metrics = calculateRiskMetrics(portfolio);

  res.json({
    positions: portfolio,
    riskMetrics: metrics,
    riskLimits,
    health: {
      marginHealthy: metrics.marginUtilization < (1 - riskLimits.minMarginBuffer),
      drawdownSafe: metrics.maxDrawdown < riskLimits.maxDrawdownLimit,
      concentrationSafe: metrics.concentrationRisk < riskLimits.maxConcentration,
      dailyLossSafe: Math.abs(metrics.dailyPnL) < riskLimits.maxDailyLoss * metrics.portfolioValue
    },
    timestamp: Date.now()
  });
});

// Update position (after trade execution)
router.post("/position/update", async (req, res) => {
  const { symbol, quantity, price, side } = req.body;

  const portfolio = await getPortfolio();
  const existingPosition = portfolio.find(p => p.symbol === symbol);

  if (side === 'BUY') {
    if (existingPosition) {
      const totalQuantity = existingPosition.quantity + quantity;
      const totalCost = existingPosition.avgPrice * existingPosition.quantity + price * quantity;
      const newAvgPrice = totalCost / totalQuantity;
      
      await db.update(schema.positions).set({
        quantity: totalQuantity,
        avgPrice: newAvgPrice,
        currentPrice: price,
        marketValue: totalQuantity * price,
        unrealizedPnL: (price - newAvgPrice) * totalQuantity,
        timestamp: Date.now()
      }).where(eq(schema.positions.symbol, symbol));
    } else {
      await db.insert(schema.positions).values({
        symbol,
        quantity,
        avgPrice: price,
        currentPrice: price,
        unrealizedPnL: 0,
        realizedPnL: 0,
        marketValue: quantity * price,
        timestamp: Date.now()
      });
    }
  } else if (side === 'SELL') {
    if (!existingPosition || existingPosition.quantity < quantity) {
      return res.status(400).json({ error: "Insufficient position to sell" });
    }
    const realizedPnL = (price - existingPosition.avgPrice) * quantity;
    const newQuantity = existingPosition.quantity - quantity;

    if (newQuantity === 0) {
      await db.delete(schema.positions).where(eq(schema.positions.symbol, symbol));
    } else {
      await db.update(schema.positions).set({
        quantity: newQuantity,
        realizedPnL: existingPosition.realizedPnL + realizedPnL,
        marketValue: newQuantity * price,
        timestamp: Date.now()
      }).where(eq(schema.positions.symbol, symbol));
    }
  }

  logger.info({ symbol, quantity, price, side }, "Position updated in database");
  const updatedPortfolio = await getPortfolio();
  res.json({ success: true, positions: updatedPortfolio });
});

// Validate trade against risk limits
router.post("/validate-trade", async (req, res) => {
  const { symbol, quantity, price, side } = req.body;

  const validation = await checkRiskLimits({ symbol, quantity, price, side });
  const portfolio = await getPortfolio();

  res.json({
    allowed: validation.allowed,
    reason: validation.reason,
    adjustedQuantity: validation.adjustedQuantity,
    riskMetrics: calculateRiskMetrics(portfolio)
  });
});

// Update risk limits
router.put("/risk-limits", (req, res) => {
  const updates = req.body;

  // Validate updates
  const validKeys = Object.keys(riskLimits);
  const invalidKeys = Object.keys(updates).filter(key => !validKeys.includes(key));

  if (invalidKeys.length > 0) {
    return res.status(400).json({
      error: `Invalid risk limit keys: ${invalidKeys.join(', ')}`
    });
  }

  // Apply updates
  Object.assign(riskLimits, updates);

  logger.info({ updates }, "Risk limits updated");
  res.json({
    success: true,
    riskLimits,
    message: "Risk limits updated successfully"
  });
});

// Get risk alerts
router.get("/alerts", async (req, res) => {
  const portfolio = await getPortfolio();
  const metrics = calculateRiskMetrics(portfolio);
  const alerts: string[] = [];

  if (metrics.marginUtilization > (1 - riskLimits.minMarginBuffer)) {
    alerts.push(`High margin utilization: ${(metrics.marginUtilization * 100).toFixed(1)}%`);
  }

  if (metrics.maxDrawdown > riskLimits.maxDrawdownLimit) {
    alerts.push(`Drawdown limit exceeded: ${(metrics.maxDrawdown * 100).toFixed(1)}%`);
  }

  if (metrics.concentrationRisk > riskLimits.maxConcentration) {
    alerts.push(`High concentration risk: ${(metrics.concentrationRisk * 100).toFixed(1)}%`);
  }

  if (Math.abs(metrics.dailyPnL) > riskLimits.maxDailyLoss * metrics.portfolioValue) {
    alerts.push(`Daily loss limit approached: ₹${Math.abs(metrics.dailyPnL).toLocaleString()}`);
  }

  if (metrics.sharpeRatio < 1.0) {
    alerts.push(`Low Sharpe ratio: ${metrics.sharpeRatio.toFixed(2)} (target: >1.0)`);
  }

  res.json({
    alerts,
    severity: alerts.length > 2 ? 'HIGH' : alerts.length > 0 ? 'MEDIUM' : 'LOW',
    timestamp: Date.now()
  });
});

// Portfolio performance history
router.get("/performance/history", (req, res) => {
  // Mock historical data - replace with real database
  const history = [];
  const baseValue = 100000;
  let currentValue = baseValue;

  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const dailyReturn = (Math.random() - 0.45) * 0.04; // Slightly positive bias
    currentValue *= (1 + dailyReturn);

    history.push({
      date: date.toISOString().split('T')[0],
      portfolioValue: Math.round(currentValue),
      dailyReturn: dailyReturn,
      cumulativeReturn: (currentValue - baseValue) / baseValue
    });
  }

  res.json({
    history,
    summary: {
      period: "30 days",
      totalReturn: (currentValue - baseValue) / baseValue,
      annualizedReturn: ((currentValue / baseValue) ** (365/30) - 1),
      bestDay: Math.max(...history.map(h => h.dailyReturn)),
      worstDay: Math.min(...history.map(h => h.dailyReturn)),
      volatility: 0.016 // 1.6% daily volatility
    }
  });
});

export default router;