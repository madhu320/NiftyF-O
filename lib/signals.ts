import { NseApi } from './nse';

export interface Signal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  timestamp: number;
  reasons: string[];
  spotPrice?: number;
}

export class SignalEngine {
  private nseApi: NseApi;

  constructor() {
    this.nseApi = new NseApi();
  }

  /**
   * Analyzes the real-time options chain and generates a directional signal.
   */
  async generateSignal(symbol: string = 'BANKNIFTY'): Promise<Signal> {
    const chainData: any = await this.nseApi.getOptionsChain(symbol);
    
    // Extract raw NSE data points
    const records = chainData?.records?.data || [];
    const spotPrice = chainData?.records?.underlyingValue;
    
    if (!records.length || !spotPrice) {
      throw new Error('Invalid options chain data received from NSE');
    }

    let totalCeOI = 0;
    let totalPeOI = 0;
    let totalCeVol = 0;
    let totalPeVol = 0;

    // Calculate absolute Put-Call Ratio (PCR) based on OI and Volume
    records.forEach((record: any) => {
      if (record.CE) {
        totalCeOI += record.CE.openInterest || 0;
        totalCeVol += record.CE.totalTradedVolume || 0;
      }
      if (record.PE) {
        totalPeOI += record.PE.openInterest || 0;
        totalPeVol += record.PE.totalTradedVolume || 0;
      }
    });

    const pcrOI = totalPeOI / (totalCeOI || 1);
    const pcrVol = totalPeVol / (totalCeVol || 1);

    let confidence = 50; // Base neutral score
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const reasons: string[] = [];

    // Assess Bullish signals
    if (pcrOI > 1.2) {
      confidence += 20;
      reasons.push(`Strong Put Writing (PCR OI: ${pcrOI.toFixed(2)}) indicates solid support.`);
    } else if (pcrOI > 1.0) {
      confidence += 10;
      reasons.push(`Mildly bullish sentiment (PCR OI: ${pcrOI.toFixed(2)}).`);
    }

    // Assess Bearish signals
    if (pcrOI < 0.8) {
      confidence -= 20;
      reasons.push(`Strong Call Writing (PCR OI: ${pcrOI.toFixed(2)}) indicates heavy resistance.`);
    } else if (pcrOI < 0.95) {
      confidence -= 10;
      reasons.push(`Mildly bearish sentiment (PCR OI: ${pcrOI.toFixed(2)}).`);
    }

    // Volume Momentum assessment
    if (pcrVol > 1.1) {
      confidence += 15;
      reasons.push(`Put Volume dominates (PCR Vol: ${pcrVol.toFixed(2)}), accelerating bullish momentum.`);
    } else if (pcrVol < 0.9) {
      confidence -= 15;
      reasons.push(`Call Volume dominates (PCR Vol: ${pcrVol.toFixed(2)}), accelerating bearish momentum.`);
    }

    // Derive final Action and Confidence
    if (confidence >= 70) {
      action = 'BUY';
    } else if (confidence <= 30) {
      action = 'SELL';
      // Invert confidence to reflect the strength of the SELL signal itself
      confidence = 100 - confidence;
    } else {
      action = 'HOLD';
      // Distance from 50 measures how strong the hold is (closer to 50 = stronger hold)
      confidence = 100 - Math.abs(50 - confidence) * 2;
    }

    return {
      symbol,
      action,
      confidence: Math.min(100, Math.max(0, confidence)),
      timestamp: Date.now(),
      reasons,
      spotPrice
    };
  }
}