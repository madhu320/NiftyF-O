import {
  meanReversionSignal,
  momentumRSISignal,
  aggregateSignals,
  type StrategySignal
} from "./advancedAlgorithms";

export interface HistoricalCandle {
  timestamp: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradeRecord {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  returnPct: number;
  type: 'LONG' | 'SHORT' | 'BUY_CE' | 'BUY_PE';
}

// Reuse technical indicators for the backtester
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length <= period) return 50;
  let gains = 0, losses = 0;
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

export function runBacktest(
  historicalData: HistoricalCandle[],
  initialCapital: number = 100000,
  useOptions: boolean = false
) {
  let capital = initialCapital;
  let position = 0;
  let currentTradeType: 'LONG' | 'SHORT' | 'BUY_CE' | 'BUY_PE' | null = null;
  let entrySpotPrice = 0;
  let entryOptionPremium = 0;
  let entryTimestamp = 0;
  const trades: TradeRecord[] = [];
  
  const history: number[] = [];
  const volumes: number[] = [];

  let peakCapital = initialCapital;
  let maxDrawdown = 0;

  for (let i = 0; i < historicalData.length; i++) {
    const candle = historicalData[i];
    history.push(candle.close);
    volumes.push(candle.volume);
    
    // Keep a rolling window of 60 periods to save memory
    if (history.length > 60) {
      history.shift();
      volumes.shift();
    }

    // Need at least 50 periods to calculate a reliable MA50
    if (history.length < 50) continue;

    const ma50 = history.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const rsi = calculateRSI(history);
    const momentum = calculateMomentum(history);
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    // Generate signals using your actual advanced algorithms
    const signals: StrategySignal[] = [
      { ...meanReversionSignal(candle.close, ma50, 0.15, Math.abs(momentum)), weight: 1.0 },
      { ...momentumRSISignal(rsi, momentum, candle.volume, avgVolume), weight: 1.5 }
    ];

    const finalSignal = aggregateSignals(signals, 0.015);

    // --- Simulated Execution Logic ---
    if (position === 0) {
      if (finalSignal.action === 'BUY' && finalSignal.confidence > 40) {
        currentTradeType = useOptions ? 'BUY_CE' : 'LONG';
        const tradeSize = capital * 0.10; // Risk 10% of total capital per trade
        
        if (useOptions) {
          entryOptionPremium = candle.close * 0.012; // Simulate 1.2% ATM premium
          position = Math.floor(tradeSize / entryOptionPremium);
          entrySpotPrice = candle.close;
          entryTimestamp = typeof candle.timestamp === 'string' ? new Date(candle.timestamp).getTime() : candle.timestamp;
          capital -= position * entryOptionPremium;
        } else {
          position = Math.floor(tradeSize / candle.close);
          entrySpotPrice = candle.close;
          entryTimestamp = typeof candle.timestamp === 'string' ? new Date(candle.timestamp).getTime() : candle.timestamp;
        }
      } else if (finalSignal.action === 'SELL' && finalSignal.confidence > 40) {
        currentTradeType = useOptions ? 'BUY_PE' : 'SHORT';
        const tradeSize = capital * 0.10;
        
        if (useOptions) {
          entryOptionPremium = candle.close * 0.012; 
          position = Math.floor(tradeSize / entryOptionPremium);
          entrySpotPrice = candle.close;
          entryTimestamp = typeof candle.timestamp === 'string' ? new Date(candle.timestamp).getTime() : candle.timestamp;
          capital -= position * entryOptionPremium;
        } else {
          position = Math.floor(tradeSize / candle.close);
          entrySpotPrice = candle.close;
          entryTimestamp = typeof candle.timestamp === 'string' ? new Date(candle.timestamp).getTime() : candle.timestamp;
        }
      }
    } 
    else if (position > 0 && currentTradeType) {
      let pnl = 0;
      let pnlPct = 0;
      let exitPrice = candle.close;
      let shouldExit = false;

      if (useOptions) {
        const spotDiff = candle.close - entrySpotPrice;
        const currentTimestamp = typeof candle.timestamp === 'string' ? new Date(candle.timestamp).getTime() : candle.timestamp;
        const daysElapsed = Math.max(0, (currentTimestamp - entryTimestamp) / (1000 * 60 * 60 * 24));
        
        // Simulate theta (time decay) over multiple days: ~10% loss of entry premium per day
        const thetaDecay = entryOptionPremium * 0.10 * daysElapsed;

        // Delta approximation: ~0.5 for ATM
        let currentPremium = currentTradeType === 'BUY_CE' 
          ? Math.max(0, entryOptionPremium + spotDiff * 0.5 - thetaDecay) 
          : Math.max(0, entryOptionPremium - spotDiff * 0.5 - thetaDecay);
        
        exitPrice = currentPremium;
        pnl = (currentPremium - entryOptionPremium) * position;
        pnlPct = (currentPremium - entryOptionPremium) / entryOptionPremium;

        if ((currentTradeType === 'BUY_CE' && finalSignal.action === 'SELL' && finalSignal.confidence > 40) ||
            (currentTradeType === 'BUY_PE' && finalSignal.action === 'BUY' && finalSignal.confidence > 40) ||
            pnlPct < -0.30 || pnlPct > 0.60) { // Wider StopLoss/TakeProfit for volatile options
          shouldExit = true;
          capital += position * exitPrice;
        }
      } else {
        if (currentTradeType === 'LONG') {
          pnl = (candle.close - entrySpotPrice) * position;
          pnlPct = (candle.close - entrySpotPrice) / entrySpotPrice;
          shouldExit = (finalSignal.action === 'SELL' && finalSignal.confidence > 40) || pnlPct < -0.02 || pnlPct > 0.05;
        } else {
          pnl = (entrySpotPrice - candle.close) * position;
          pnlPct = (entrySpotPrice - candle.close) / entrySpotPrice;
          shouldExit = (finalSignal.action === 'BUY' && finalSignal.confidence > 40) || pnlPct < -0.02 || pnlPct > 0.05;
        }
        if (shouldExit) capital += pnl;
      }

      if (shouldExit) {
        trades.push({
          type: currentTradeType,
          entryPrice: useOptions ? entryOptionPremium : entrySpotPrice,
          exitPrice,
          quantity: position,
          pnl,
          returnPct: pnlPct
        });
        position = 0;
        currentTradeType = null;
      }
    }

    // Update Drawdown Metrics
    let currentPortfolioValue = capital;
    if (position > 0 && currentTradeType) {
      if (useOptions) {
        const spotDiff = candle.close - entrySpotPrice;
        const currentTimestamp = typeof candle.timestamp === 'string' ? new Date(candle.timestamp).getTime() : candle.timestamp;
        const daysElapsed = Math.max(0, (currentTimestamp - entryTimestamp) / (1000 * 60 * 60 * 24));
        const thetaDecay = entryOptionPremium * 0.10 * daysElapsed;
        
        let currentPremium = currentTradeType === 'BUY_CE' 
          ? Math.max(0, entryOptionPremium + spotDiff * 0.5 - thetaDecay) 
          : Math.max(0, entryOptionPremium - spotDiff * 0.5 - thetaDecay);
        currentPortfolioValue += position * currentPremium;
      } else {
        const unrealizedPnl = currentTradeType === 'LONG' 
          ? (candle.close - entrySpotPrice) * position 
          : (entrySpotPrice - candle.close) * position;
        currentPortfolioValue += unrealizedPnl; // Simulated margin behavior
      }
    }
    
    if (currentPortfolioValue > peakCapital) peakCapital = currentPortfolioValue;
    const drawdown = (peakCapital - currentPortfolioValue) / peakCapital;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const totalReturn = (capital - initialCapital) / initialCapital;
  const winningTrades = trades.filter(t => t.pnl > 0);
  const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;

  // Simplified annualized return assuming data represents 1 year if count ~ 100,000 mins
  const annualizedReturn = totalReturn; 

  return { initialCapital, finalCapital: capital, totalReturn, annualizedReturn, maxDrawdown, winRate, totalTrades: trades.length, trades };
}