import AsyncStorage from "@react-native-async-storage/async-storage";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  from: string;
  to: string;
  price: number;
}

const HISTORY_KEY = "@niftybank_signal_history";
const MAX_ENTRIES = 100;

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function appendHistory(entry: Omit<HistoryEntry, "id">): Promise<void> {
  try {
    const existing = await loadHistory();
    const newEntry: HistoryEntry = { ...entry, id: `${Date.now()}-${Math.random()}` };
    const updated = [newEntry, ...existing].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore storage errors
  }
}
