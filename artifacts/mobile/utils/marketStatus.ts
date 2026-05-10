export type MarketState = "open" | "pre-market" | "closed" | "holiday";

export interface MarketStatus {
  state: MarketState;
  label: string;
  color: string;
  bg: string;
  nextEventLabel: string;
  nextEventTime: string;
}

function getISTDate(): Date {
  const nowUTC = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  return new Date(nowUTC.getTime() + istOffsetMs);
}

function toMinutes(h: number, m: number) {
  return h * 60 + m;
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesToDisplay(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return padTime(h, m);
}

const PRE_OPEN_START = toMinutes(9, 0);
const MARKET_OPEN = toMinutes(9, 15);
const MARKET_CLOSE = toMinutes(15, 30);
const PRE_OPEN_CLOSE = toMinutes(9, 15);

export function getMarketStatus(): MarketStatus {
  const ist = getISTDate();
  const day = ist.getUTCDay(); // 0 = Sun, 6 = Sat
  const currentMins = toMinutes(ist.getUTCHours(), ist.getUTCMinutes());

  const isWeekday = day >= 1 && day <= 5;

  if (!isWeekday) {
    const daysUntilMon = day === 0 ? 1 : 2; // Sun → 1, Sat → 2
    return {
      state: "holiday",
      label: "Market Closed",
      color: "#EF4444",
      bg: "#EF444422",
      nextEventLabel: "Opens Monday at",
      nextEventTime: "09:15 IST",
    };
  }

  if (currentMins >= MARKET_OPEN && currentMins < MARKET_CLOSE) {
    const minsLeft = MARKET_CLOSE - currentMins;
    const closeH = Math.floor(MARKET_CLOSE / 60);
    const closeM = MARKET_CLOSE % 60;
    const hLeft = Math.floor(minsLeft / 60);
    const mLeft = minsLeft % 60;
    const countdownLabel =
      hLeft > 0 ? `${hLeft}h ${mLeft}m remaining` : `${mLeft}m remaining`;
    return {
      state: "open",
      label: "Market Open",
      color: "#22C55E",
      bg: "#22C55E22",
      nextEventLabel: countdownLabel,
      nextEventTime: `Closes ${padTime(closeH, closeM)} IST`,
    };
  }

  if (currentMins >= PRE_OPEN_START && currentMins < PRE_OPEN_CLOSE) {
    const minsLeft = PRE_OPEN_CLOSE - currentMins;
    return {
      state: "pre-market",
      label: "Pre-Market",
      color: "#F5C518",
      bg: "#F5C51822",
      nextEventLabel: `Opens in ${minsLeft}m`,
      nextEventTime: "09:15 IST",
    };
  }

  if (currentMins < PRE_OPEN_START) {
    const minsLeft = PRE_OPEN_START - currentMins;
    const hLeft = Math.floor(minsLeft / 60);
    const mLeft = minsLeft % 60;
    const label = hLeft > 0 ? `${hLeft}h ${mLeft}m to pre-open` : `${mLeft}m to pre-open`;
    return {
      state: "closed",
      label: "Market Closed",
      color: "#EF4444",
      bg: "#EF444422",
      nextEventLabel: label,
      nextEventTime: "Pre-open 09:00 IST",
    };
  }

  // After market close
  const minsLeft = toMinutes(24, 0) - currentMins + PRE_OPEN_START;
  return {
    state: "closed",
    label: "Market Closed",
    color: "#EF4444",
    bg: "#EF444422",
    nextEventLabel: "Pre-open tomorrow",
    nextEventTime: "09:00 IST",
  };
}
