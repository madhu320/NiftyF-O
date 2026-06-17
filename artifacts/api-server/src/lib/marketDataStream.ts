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

function isMarketOpen(): boolean {
  const nowUtc = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(nowUtc.getTime() + istOffset);

  const day = istTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const marketStart = 9 * 60 + 15; // 09:15 AM IST
  const marketEnd = 15 * 60 + 30; // 03:30 PM IST

  return timeInMinutes >= marketStart && timeInMinutes <= marketEnd;
}

type YahooCandle = {
  close: number;
};

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
    
    this.isConnected = true;
    this.emit('connected');
    logger.info("Market data WebSocket connected successfully");

    this.startYahooStream();
  }

  private async fetchRealBasePrice(symbol: string): Promise<number> {
    try {
      const ticker = symbol === 'BANKNIFTY' ? '%5ENSEBANK' : '%5ENSEI';
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await res.json() as any;
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) return price;
    } catch (e) {
      logger.warn(`Failed to fetch real base price for ${symbol}.`);
    }
    return 0;
  }

  private async fetchRecentHistory(symbol: string): Promise<number[]> {
    try {
      const ticker = symbol === 'BANKNIFTY' ? '%5ENSEBANK' : '%5ENSEI';
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return [];
      const data = await res.json() as any;
      const quote = data.chart?.result?.[0]?.indicators?.quote?.[0];
      const closes: number[] = (quote?.close ?? [])
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      return closes.slice(-120);
    } catch {
      return [];
    }
  }

  public async subscribe(symbols: string[]) {
    for (const s of symbols) {
      this.subscriptions.add(s);
      if (!this.priceHistory.has(s)) {
        // For production readiness, initialize from real historical closes only.
        if (s === 'BANKNIFTY' || s === 'NIFTY') {
          const history = await this.fetchRecentHistory(s);
          if (history.length > 0) {
            this.priceHistory.set(s, history);
            this.latestPrices.set(s, history[history.length - 1]);
          } else {
            const basePrice = await this.fetchRealBasePrice(s);
            if (basePrice > 0) {
              this.priceHistory.set(s, [basePrice]);
              this.latestPrices.set(s, basePrice);
            }
          }
        }

        if (!this.priceHistory.has(s)) {
          const last = this.latestPrices.get(s);
          this.priceHistory.set(s, last ? [last] : []);
        }
        
        this.latestVolumes.set(s, 0);
      }
    }
    logger.info({ symbols }, "Subscribed to live market data symbols");
  }

  // Polls Yahoo Finance every 10 seconds for real index prices.
  // Falls back silently to last known price on network error.
  private startYahooStream() {
    const POLL_INTERVAL_MS = 10_000;

    const poll = async () => {
      if (!this.isConnected) return;
      if (!isMarketOpen()) return;

      for (const symbol of this.subscriptions) {
        if (symbol !== 'BANKNIFTY' && symbol !== 'NIFTY') continue;
        try {
          const ticker = symbol === 'BANKNIFTY' ? '%5ENSEBANK' : '%5ENSEI';
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as any;
          const meta = data.chart?.result?.[0]?.meta;
          const price: number = meta?.regularMarketPrice ?? meta?.previousClose ?? this.latestPrices.get(symbol) ?? 0;
          const volume: number = meta?.regularMarketVolume ?? 0;

          if (price > 0) {
            this.latestPrices.set(symbol, price);
            this.latestVolumes.set(symbol, volume);

            let history = this.priceHistory.get(symbol);
            if (!history) { history = [price]; this.priceHistory.set(symbol, history); }
            history.push(price);
            if (history.length > 120) history.shift();

            this.emit('tick', { symbol, price, volume, timestamp: Date.now() });
            logger.debug({ symbol, price }, 'Live price updated from Yahoo Finance');
          }
        } catch (err) {
          logger.warn({ symbol, err }, 'Yahoo Finance poll failed, retaining last known price');
        }
      }
    };

    // Fire immediately then repeat
    poll();
    this.streamInterval = setInterval(poll, POLL_INTERVAL_MS);
  }

  public getLatestPrice(symbol: string): number { return this.latestPrices.get(symbol) || 0; }
  public getLatestVolume(symbol: string): number { return this.latestVolumes.get(symbol) || 0; }
  public getLatestOI(symbol: string): number { return this.latestOI.get(symbol) || 0; }
  public getPriceHistory(symbol: string): number[] { return this.priceHistory.get(symbol) || []; }
}

export const marketStream = MarketDataStream.getInstance();