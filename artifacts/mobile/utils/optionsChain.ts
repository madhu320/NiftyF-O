import { RENDER_API_URL } from "@/constants/config";

export interface OptionLeg {
  oi: number;
  volume: number;
  ltp: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface StrikeRow {
  strike: number;
  ce: OptionLeg;
  pe: OptionLeg;
}

export function getPercentATM(strike: number, spot: number): string {
  if (!spot) return "0%";
  const pct = ((strike - spot) / spot) * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export interface OptionsChainData {
  expiry: string;
  availableExpiries?: string[];
  spot: number;
  strikes: StrikeRow[];
  pcr?: number; // put-call ratio by OI
  theoretical?: boolean; // true when prices are Black-Scholes estimates
}

export async function fetchOptionsChain(): Promise<OptionsChainData> {
  const res = await fetch(`${RENDER_API_URL}/options-chain`);
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data as OptionsChainData;
}

export function computePCR(strikes: StrikeRow[]): number {
  const totalCeOI = strikes.reduce((s, r) => s + r.ce.oi, 0);
  const totalPeOI = strikes.reduce((s, r) => s + r.pe.oi, 0);
  return totalCeOI > 0 ? totalPeOI / totalCeOI : 0;
}

export function findATMIndex(strikes: StrikeRow[], spot: number): number {
  let closest = 0;
  let minDiff = Infinity;
  strikes.forEach((s, i) => {
    const diff = Math.abs(s.strike - spot);
    if (diff < minDiff) { minDiff = diff; closest = i; }
  });
  return closest;
}

export function formatOI(oi: number): string {
  if (oi >= 10_000_000) return `${(oi / 10_000_000).toFixed(1)}Cr`;
  if (oi >= 100_000) return `${(oi / 100_000).toFixed(1)}L`;
  if (oi >= 1_000) return `${(oi / 1_000).toFixed(1)}K`;
  return String(oi);
}
