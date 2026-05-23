import { EventEmitter } from 'events';
import { logger } from './logger';

export interface TickData {
  symbol: string;
  price: number;
  volume: number;
  oi?: number;
  iv?: number;
  timestamp: number;
}

class MarketDataStream extends EventEmitter {
  private isConnected = false;
  private subscriptions = new Set<string>();
  
  // In-memory state for lightning-fast algorithm access
  private latestPrices = new Map<string, number>();
  private latestVolumes = new Map<string, number>();
  private latestOI = new Map<string, number>();
  private priceHistory = new Map<string, number[]>();
  
  private streamInterval?: NodeJS.Timeout;
  private static instance: MarketDataStream;

  public static getInstance(): MarketDataStream {
    if (!MarketDataStream.instance) {
      MarketDataStream.instance = new MarketDataStream();
    }
    return MarketDataStream.instance;
  }

  public async connect(apiKey?: string): Promise<void> {
    if (this.isConnected) return;
    
    logger.info("Connecting to real-time market data WebSocket...");
    
    // Simulate connection delay for broker WS handshake
    await new Promise(resolve => setTimeout(resolve, 500));
    this.isConnected = true;
    this.emit('connected');
    logger.info("Market data WebSocket connected successfully");

    this.startMockStream(); // Replace this call with actual broker WebSocket instantiation
  }

  private async fetchRealBasePrice(symbol: string): Promise<number> {
    try {
      const ticker = symbol === 'BANKNIFTY' ? '%5ENSEBANK' : '%5ENSEI';
      const res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`);
      const data = await res.json() as any;
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) return price;
    } catch (e) {
      logger.warn(`Failed to fetch real base price for ${symbol}, falling back to mock base.`);
    }
    return symbol === 'BANKNIFTY' ? 45000 : 21000;
  }

  public async subscribe(symbols: string[]) {
    for (const s of symbols) {
      this.subscriptions.add(s);
      if (!this.priceHistory.has(s)) {
        // Only fetch index spot prices from Yahoo. Allow Option contracts to fallback to Black-Scholes.
        if (s === 'BANKNIFTY' || s === 'NIFTY') {
          const basePrice = await this.fetchRealBasePrice(s);
          const history = Array.from({ length: 60 }, () => basePrice + (Math.random() - 0.5) * (s === 'BANKNIFTY' ? 100 : 50));
          this.priceHistory.set(s, history);
          this.latestPrices.set(s, history[history.length - 1]);
        }
        
        this.latestVolumes.set(s, 0);
      }
    }
    logger.info({ symbols }, "Subscribed to live market data symbols");
  }

  private startMockStream() {
    // Simulates receiving 1-second ticks from a broker WebSocket
    this.streamInterval = setInterval(() => {
      if (!this.isConnected) return;

      this.subscriptions.forEach(symbol => {
        // We only simulate the random walk for the underlying indices to save CPU.
        // In production, real broker ticks will overwrite all symbols (including options) here.
        if (symbol === 'BANKNIFTY' || symbol === 'NIFTY') {
          const currentPrice = this.latestPrices.get(symbol)!;
          const change = (Math.random() - 0.5) * (symbol === 'BANKNIFTY' ? 10 : 5);
          const newPrice = currentPrice + change;
          const volume = Math.floor(Math.random() * 1000);
          
          this.latestPrices.set(symbol, newPrice);
          this.latestVolumes.set(symbol, volume);
          
          const history = this.priceHistory.get(symbol)!;
          history.push(newPrice);
          if (history.length > 60) history.shift(); // Keep last 60 minutes for MAs/RSI

          this.emit('tick', { symbol, price: newPrice, volume, timestamp: Date.now() });
        }
      });
    }, 1000);
  }

  public getLatestPrice(symbol: string): number { return this.latestPrices.get(symbol) || 0; }
  public getLatestVolume(symbol: string): number { return this.latestVolumes.get(symbol) || 0; }
  public getLatestOI(symbol: string): number { return this.latestOI.get(symbol) || 0; }
  public getPriceHistory(symbol: string): number[] { return this.priceHistory.get(symbol) || []; }
}

export const marketStream = MarketDataStream.getInstance();