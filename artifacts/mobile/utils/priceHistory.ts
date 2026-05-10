import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PriceReading {
  timestamp: number;
  price: number;
}

const PRICE_HISTORY_KEY = "@niftybank_price_history";
const MAX_READINGS = 50;

export async function loadPriceHistory(): Promise<PriceReading[]> {
  try {
    const raw = await AsyncStorage.getItem(PRICE_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as PriceReading[]) : [];
  } catch {
    return [];
  }
}

export async function appendPriceReading(price: number): Promise<PriceReading[]> {
  try {
    const existing = await loadPriceHistory();
    const newReading: PriceReading = { timestamp: Date.now(), price };
    const updated = [...existing, newReading].slice(-MAX_READINGS);
    await AsyncStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}
