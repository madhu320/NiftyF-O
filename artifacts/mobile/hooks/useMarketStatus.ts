import { useState, useEffect } from "react";
import { getMarketStatus, type MarketStatus } from "@/utils/marketStatus";

export function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(getMarketStatus);

  useEffect(() => {
    // Refresh every 30 seconds so the countdown stays current
    const id = setInterval(() => {
      setStatus(getMarketStatus());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return status;
}
