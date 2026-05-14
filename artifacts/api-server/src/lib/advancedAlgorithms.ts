// Advanced Algorithmic Trading Strategies for Nifty Options

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  reasoning: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedReturn: number; // percentage
  stopLoss?: number;
  targetPrice?: number;
}

export interface MarketData {
  timestamp: number;
  spot: number;
  volume: number;
  oi: number;
  vwap?: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

// 1. Mean Reversion Strategy (Bank Nifty tends to revert to 50-day MA)
export function meanReversionSignal(
  currentPrice: number,
  ma50: number,
  volatility: number,
  trendStrength: number
): StrategySignal {
  const deviation = (currentPrice - ma50) / ma50;
  const volAdjustedThreshold = volatility * 0.02; // 2% of volatility

  if (Math.abs(deviation) > volAdjustedThreshold && trendStrength < 0.3) {
    return {
      action: deviation > 0 ? 'SELL' : 'BUY',
      confidence: Math.min(85, Math.abs(deviation) * 1000),
      reasoning: [
        `Price deviated ${deviation.toFixed(2)}% from 50-day MA`,
        `Low trend strength (${trendStrength.toFixed(2)}) supports reversion`,
        `Volatility-adjusted threshold: ${volAdjustedThreshold.toFixed(2)}`
      ],
      riskLevel: Math.abs(deviation) > volAdjustedThreshold * 2 ? 'HIGH' : 'MEDIUM',
      expectedReturn: Math.abs(deviation) * 0.7, // Expect 70% reversion
      stopLoss: deviation > 0 ? currentPrice * 1.02 : currentPrice * 0.98
    };
  }

  return {
    action: 'HOLD',
    confidence: 20,
    reasoning: ['Price within normal range of mean'],
    riskLevel: 'LOW',
    expectedReturn: 0
  };
}

// 2. Volatility Skew Trading (Sell overpriced options, buy underpriced)
export function volatilitySkewSignal(
  spot: number,
  strikes: Array<{strike: number, ce_iv: number, pe_iv: number}>,
  atmIV: number
): StrategySignal {
  const skews = strikes.map(s => ({
    strike: s.strike,
    moneyness: (s.strike - spot) / spot,
    ce_skew: s.ce_iv - atmIV,
    pe_skew: s.pe_iv - atmIV
  }));

  // Look for asymmetric skews (bullish/bearish bias opportunities)
  const avgCeSkew = skews.reduce((sum, s) => sum + s.ce_skew, 0) / skews.length;
  const avgPeSkew = skews.reduce((sum, s) => sum + s.pe_skew, 0) / skews.length;

  const skewDifferential = avgCeSkew - avgPeSkew;

  if (Math.abs(skewDifferential) > 0.05) { // 5% skew difference
    return {
      action: skewDifferential > 0 ? 'BUY' : 'SELL', // Buy when CE overpriced vs PE
      confidence: Math.min(90, Math.abs(skewDifferential) * 1000),
      reasoning: [
        `CE-PE skew differential: ${skewDifferential.toFixed(3)}`,
        `Average CE skew: ${avgCeSkew.toFixed(3)}, PE skew: ${avgPeSkew.toFixed(3)}`,
        skewDifferential > 0 ? 'CE options overpriced - bullish bias opportunity' :
                               'PE options overpriced - bearish bias opportunity'
      ],
      riskLevel: 'MEDIUM',
      expectedReturn: Math.abs(skewDifferential) * 200 // Expect 2x the skew differential
    };
  }

  return {
    action: 'HOLD',
    confidence: 15,
    reasoning: ['Volatility skew within normal range'],
    riskLevel: 'LOW',
    expectedReturn: 0
  };
}

// 3. Momentum + RSI Strategy (Bank Nifty momentum trading)
export function momentumRSISignal(
  rsi: number,
  momentum: number,
  volume: number,
  avgVolume: number
): StrategySignal {
  const volumeMultiplier = volume / avgVolume;

  // Oversold with momentum
  if (rsi < 30 && momentum > 0.5 && volumeMultiplier > 1.2) {
    return {
      action: 'BUY',
      confidence: Math.min(95, (35 - rsi) * 2 + momentum * 50),
      reasoning: [
        `RSI oversold at ${rsi.toFixed(1)}`,
        `Strong momentum: ${momentum.toFixed(2)}`,
        `High volume: ${volumeMultiplier.toFixed(1)}x average`
      ],
      riskLevel: 'MEDIUM',
      expectedReturn: (35 - rsi) * 0.8, // Expect 80% of RSI recovery
      stopLoss: -2.0 // 2% stop loss
    };
  }

  // Overbought against momentum
  if (rsi > 70 && momentum < -0.5 && volumeMultiplier > 1.2) {
    return {
      action: 'SELL',
      confidence: Math.min(95, (rsi - 65) * 2 + Math.abs(momentum) * 50),
      reasoning: [
        `RSI overbought at ${rsi.toFixed(1)}`,
        `Strong negative momentum: ${momentum.toFixed(2)}`,
        `High volume: ${volumeMultiplier.toFixed(1)}x average`
      ],
      riskLevel: 'MEDIUM',
      expectedReturn: (rsi - 65) * 0.8,
      stopLoss: 2.0 // 2% stop loss
    };
  }

  return {
    action: 'HOLD',
    confidence: 10,
    reasoning: ['RSI and momentum within normal ranges'],
    riskLevel: 'LOW',
    expectedReturn: 0
  };
}

// 4. Options Flow Analysis (Smart money tracking)
export function optionsFlowSignal(
  callOIChange: number,
  putOIChange: number,
  callVolume: number,
  putVolume: number,
  pcr: number
): StrategySignal {
  const oiDifferential = callOIChange - putOIChange;
  const volumeRatio = callVolume / (putVolume || 1);

  // Institutional accumulation (calls)
  if (oiDifferential > 100000 && volumeRatio > 1.5 && pcr < 0.8) {
    return {
      action: 'BUY',
      confidence: Math.min(88, Math.abs(oiDifferential) / 2000),
      reasoning: [
        `Strong call OI accumulation: +${oiDifferential.toLocaleString()}`,
        `Call volume dominance: ${volumeRatio.toFixed(1)}x puts`,
        `Low PCR ${pcr.toFixed(2)} indicates bullish sentiment`
      ],
      riskLevel: 'MEDIUM',
      expectedReturn: Math.abs(oiDifferential) / 50000, // Scale with OI change
      targetPrice: 1.5 // 1.5% target
    };
  }

  // Institutional distribution (puts)
  if (oiDifferential < -100000 && volumeRatio < 0.7 && pcr > 1.2) {
    return {
      action: 'SELL',
      confidence: Math.min(88, Math.abs(oiDifferential) / 2000),
      reasoning: [
        `Strong put OI accumulation: ${oiDifferential.toLocaleString()}`,
        `Put volume dominance: ${(1/volumeRatio).toFixed(1)}x calls`,
        `High PCR ${pcr.toFixed(2)} indicates bearish sentiment`
      ],
      riskLevel: 'MEDIUM',
      expectedReturn: Math.abs(oiDifferential) / 50000,
      targetPrice: -1.5 // 1.5% target
    };
  }

  return {
    action: 'HOLD',
    confidence: 12,
    reasoning: ['Options flow neutral'],
    riskLevel: 'LOW',
    expectedReturn: 0
  };
}

// 5. Statistical Arbitrage (Pairs trading with Nifty)
export function statisticalArbSignal(
  bankNiftyPrice: number,
  niftyPrice: number,
  spread: number,
  spreadMA: number,
  spreadStd: number
): StrategySignal {
  const zScore = (spread - spreadMA) / spreadStd;
  const beta = 1.2; // Bank Nifty typically 1.2x Nifty movement

  // Spread too wide - long underperformer, short outperformer
  if (Math.abs(zScore) > 2.0) {
    const expectedSpread = spreadMA;
    const convergence = (expectedSpread - spread) / spread;

    return {
      action: zScore > 0 ? 'BUY' : 'SELL', // Buy when Bank Nifty cheap vs Nifty
      confidence: Math.min(92, Math.abs(zScore) * 20),
      reasoning: [
        `Spread z-score: ${zScore.toFixed(2)} (${Math.abs(zScore) > 3 ? 'extreme' : 'significant'})`,
        `Current spread: ${spread.toFixed(2)}, Expected: ${expectedSpread.toFixed(2)}`,
        `Expected convergence: ${convergence.toFixed(2)}%`
      ],
      riskLevel: Math.abs(zScore) > 3 ? 'HIGH' : 'MEDIUM',
      expectedReturn: Math.abs(convergence) * 0.6, // Expect 60% convergence
      stopLoss: Math.abs(zScore) > 3 ? 1.0 : 0.5 // Tighter stops for extreme deviations
    };
  }

  return {
    action: 'HOLD',
    confidence: 8,
    reasoning: ['Spread within normal statistical range'],
    riskLevel: 'LOW',
    expectedReturn: 0
  };
}

// Master signal aggregator with risk management
export function aggregateSignals(
  signals: StrategySignal[],
  portfolioRisk: number,
  maxRiskPerTrade: number = 0.02 // 2% max risk per trade
): StrategySignal {
  const activeSignals = signals.filter(s => s.action !== 'HOLD');

  if (activeSignals.length === 0) {
    return {
      action: 'HOLD',
      confidence: 5,
      reasoning: ['No strong signals from any strategy'],
      riskLevel: 'LOW',
      expectedReturn: 0
    };
  }

  // Weight signals by confidence and risk
  const weightedSignals = activeSignals.map(s => ({
    ...s,
    weight: s.confidence * (s.riskLevel === 'LOW' ? 1.2 : s.riskLevel === 'MEDIUM' ? 1.0 : 0.8)
  }));

  const buyWeight = weightedSignals
    .filter(s => s.action === 'BUY')
    .reduce((sum, s) => sum + s.weight, 0);

  const sellWeight = weightedSignals
    .filter(s => s.action === 'SELL')
    .reduce((sum, s) => sum + s.weight, 0);

  const totalWeight = buyWeight + sellWeight;
  const buyRatio = buyWeight / totalWeight;

  // Risk-adjusted position sizing
  const riskMultiplier = Math.min(1, maxRiskPerTrade / (portfolioRisk + 0.005));

  if (totalWeight > 100 && riskMultiplier > 0.3) {
    const action = buyRatio > 0.6 ? 'BUY' : buyRatio < 0.4 ? 'SELL' : 'HOLD';
    const confidence = Math.min(95, totalWeight * riskMultiplier);

    return {
      action,
      confidence,
      reasoning: [
        `Aggregated ${activeSignals.length} strategy signals`,
        `Buy:Sell weight ratio: ${buyRatio.toFixed(2)}`,
        `Risk multiplier: ${riskMultiplier.toFixed(2)}`,
        ...activeSignals.slice(0, 2).map(s => `${s.action} signal (${s.confidence}% confidence)`)
      ],
      riskLevel: portfolioRisk > 0.05 ? 'HIGH' : portfolioRisk > 0.02 ? 'MEDIUM' : 'LOW',
      expectedReturn: activeSignals.reduce((sum, s) => sum + s.expectedReturn * s.confidence / 100, 0) / activeSignals.length,
      stopLoss: Math.min(...activeSignals.map(s => s.stopLoss || 2.0).filter(x => x > 0))
    };
  }

  return {
    action: 'HOLD',
    confidence: 5,
    reasoning: ['Insufficient signal strength or risk constraints'],
    riskLevel: 'LOW',
    expectedReturn: 0
  };
}