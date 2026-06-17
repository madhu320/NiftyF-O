import { ANT_ENDPOINTS } from "../constants/apiConfig";

export interface MarketData {
  symbol: string;
  ltp: number;
  high: number;
  low: number;
  volume: number;
  oi?: number;
  iv?: number;
}

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface GreeksData {
  symbol: string;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

export async function fetchAliceBlueMarketData(symbol: string): Promise<MarketData> {
  const url = ANT_ENDPOINTS.market(symbol);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch market data: ${res.status}`);
  const data = await res.json();
  return data;
}

export async function fetchAliceBluePositions(): Promise<Position[]> {
  const url = ANT_ENDPOINTS.positions;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch positions: ${res.status}`);
  const data = await res.json();
  return data.positions || [];
}

export async function fetchAliceBlueGreeks(
  symbol: string,
  expiry: string,
  strike: number,
  type: "CE" | "PE"
): Promise<GreeksData> {
  const url = ANT_ENDPOINTS.greeks(symbol, expiry, strike, type);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Greeks: ${res.status}`);
  const data = await res.json();
  return data.greeks || data;
}

export async function fetchAliceBlueOptionsChain(symbol: string, expiry?: string): Promise<any> {
  const baseUrl = ANT_ENDPOINTS.optionsChain(symbol);
  const url = new URL(baseUrl);
  if (expiry) {
    url.searchParams.append('expiry', expiry);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch options chain: ${res.status}`);
  return res.json();
}
