export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string[];
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  weight?: number;
}

export interface AggregatedSignal extends StrategySignal {
  signals: StrategySignal[];
}

export function meanReversionSignal(
  spot: number,
  ma50: number,
  volatility: number,
  momentum: number
): StrategySignal {
  const deviation = (spot - ma50) / ma50;
  if (deviation > 0.02 && momentum < 0) {
    return { action: 'SELL', confidence: 75, reasoning: ['High deviation above MA50', 'Fading momentum'] };
  } else if (deviation < -0.02 && momentum > 0) {
    return { action: 'BUY', confidence: 75, reasoning: ['High deviation below MA50', 'Increasing momentum'] };
  }
  return { action: 'HOLD', confidence: 0, reasoning: ['Within normal MA ranges'] };
}

export function volatilitySkewSignal(
  spot: number,
  strikes: any[],
  atmIV: number
): StrategySignal {
  const otmPuts = strikes.filter(s => s.strike < spot);
  const otmCalls = strikes.filter(s => s.strike > spot);

  const avgPutIV = otmPuts.length > 0 ? otmPuts.reduce((acc, s) => acc + s.pe_iv, 0) / otmPuts.length : atmIV;
  const avgCallIV = otmCalls.length > 0 ? otmCalls.reduce((acc, s) => acc + s.ce_iv, 0) / otmCalls.length : atmIV;

  const skew = avgPutIV - avgCallIV;

  if (skew > 0.03) {
    return { action: 'SELL', confidence: 70, reasoning: ['High Put IV skew indicates bearish fear'] };
  } else if (skew < -0.03) {
    return { action: 'BUY', confidence: 70, reasoning: ['High Call IV skew indicates bullish greed'] };
  }
  return { action: 'HOLD', confidence: 50, reasoning: ['Volatility skew is neutral'] };
}

export function momentumRSISignal(
  rsi: number,
  momentum: number,
  volume: number,
  avgVolume: number
): StrategySignal {
  const isHighVolume = volume > avgVolume * 1.5;

  if (rsi > 70 && momentum < 0) {
    if (isHighVolume) {
      return { action: 'SELL', confidence: 85, reasoning: ['Overbought RSI', 'Negative momentum', 'High volume confirmation'] };
    }
    return { action: 'SELL', confidence: 60, reasoning: ['Overbought RSI', 'Negative momentum', 'Weak volume'] };
  } else if (rsi < 30 && momentum > 0) {
    if (isHighVolume) {
      return { action: 'BUY', confidence: 85, reasoning: ['Oversold RSI', 'Positive momentum', 'High volume confirmation'] };
    }
    return { action: 'BUY', confidence: 60, reasoning: ['Oversold RSI', 'Positive momentum', 'Weak volume'] };
  }
  return { action: 'HOLD', confidence: 0, reasoning: ['RSI in neutral zone'] };
}

export function optionsFlowSignal(
  callOIChange: number,
  putOIChange: number,
  callVolume: number,
  putVolume: number,
  pcr: number
): StrategySignal {
  if (pcr > 1.2 && putOIChange > callOIChange) {
    return { action: 'BUY', confidence: 70, reasoning: ['High PCR', 'Put writing detected'] };
  } else if (pcr < 0.8 && callOIChange > putOIChange) {
    return { action: 'SELL', confidence: 70, reasoning: ['Low PCR', 'Call writing detected'] };
  }
  return { action: 'HOLD', confidence: 50, reasoning: ['Neutral options flow'] };
}

export function statisticalArbSignal(
  bankNifty: number,
  nifty: number,
  spread: number,
  spreadMA: number,
  spreadStd: number
): StrategySignal {
  const zScore = spreadStd > 0 ? (spread - spreadMA) / spreadStd : 0;
  if (zScore > 2) {
    return { action: 'SELL', confidence: 65, reasoning: ['Spread Z-score > 2 (Overvalued)'] };
  } else if (zScore < -2) {
    return { action: 'BUY', confidence: 65, reasoning: ['Spread Z-score < -2 (Undervalued)'] };
  }
  return { action: 'HOLD', confidence: 50, reasoning: ['Spread within normal range'] };
}

export function aggregateSignals(
  signals: StrategySignal[],
  portfolioRisk: number
): AggregatedSignal {
  let totalWeight = 0;
  let weightedConfidence = 0;

  signals.forEach(s => {
    const weight = s.weight || 1;
    totalWeight += weight;
    
    if (s.action === 'BUY') {
      weightedConfidence += s.confidence * weight;
    } else if (s.action === 'SELL') {
      weightedConfidence -= s.confidence * weight;
    }
  });

  const netConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0;
  const absConfidence = Math.abs(netConfidence);
  
  if (netConfidence > 30) {
    return { action: 'BUY', confidence: absConfidence, reasoning: ['Strong weighted buy consensus'], signals };
  } else if (netConfidence < -30) {
    return { action: 'SELL', confidence: absConfidence, reasoning: ['Strong weighted sell consensus'], signals };
  }
  
  return { action: 'HOLD', confidence: absConfidence, reasoning: ['Mixed or weak signals'], signals };
}