import { Platform } from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api');

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
  const url = `${API_URL}/ant/market/${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch market data: ${res.status}`);
  const data = await res.json();
  return data;
}

export async function fetchAliceBluePositions(): Promise<Position[]> {
  const url = `${API_URL}/ant/positions`;
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
  const url = `${API_URL}/ant/greeks/${symbol}/${expiry}/${strike}/${type}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Greeks: ${res.status}`);
  const data = await res.json();
  return data.greeks || data;
}

export async function fetchAliceBlueOptionsChain(symbol: string, expiry?: string): Promise<any> {
  const url = new URL(`${API_URL}/ant/options-chain/${symbol}`);
  if (expiry) {
    url.searchParams.append('expiry', expiry);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch options chain: ${res.status}`);
  return res.json();
}
