import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useCallback, useState } from "react";
import { Platform } from "react-native";
import { appendHistory } from "@/utils/signalHistory";

const LAST_PREDICTION_KEY = "@niftybank_last_prediction";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function sendSignalNotification(
  oldPrediction: string,
  newPrediction: string,
  price: number
) {
  const formattedPrice = price.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const emoji = newPrediction.toLowerCase().includes("call") ? "📈" : "📉";

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${emoji} Signal Changed: ${newPrediction.toUpperCase()}`,
      body: `Nifty Bank at ₹${formattedPrice} · Previous: ${oldPrediction.toUpperCase()}`,
      data: { prediction: newPrediction, price },
      sound: true,
    },
    trigger: null,
  });
}

export function useSignalNotifications() {
  const permissionGranted = useRef(false);
  const lastPrediction = useRef<string | null>(null);
  const initialized = useRef(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    async function init() {
      permissionGranted.current = await requestPermissions();
      setNotificationsEnabled(permissionGranted.current);
      try {
        const stored = await AsyncStorage.getItem(LAST_PREDICTION_KEY);
        if (stored) lastPrediction.current = stored;
      } catch {
        // ignore storage errors
      }
      initialized.current = true;
    }

    init();
  }, []);

  const checkAndNotify = useCallback(
    async (newPrediction: string, price: number) => {
      if (Platform.OS === "web") return;
      if (!initialized.current) return;
      if (!permissionGranted.current) return;

      const prev = lastPrediction.current;

      if (prev !== null && prev.toLowerCase() !== newPrediction.toLowerCase()) {
        // Fire notification
        await sendSignalNotification(prev, newPrediction, price);
        // Persist to history log
        await appendHistory({ timestamp: Date.now(), from: prev, to: newPrediction, price });
      }

      if (prev !== newPrediction) {
        lastPrediction.current = newPrediction;
        try {
          await AsyncStorage.setItem(LAST_PREDICTION_KEY, newPrediction);
        } catch {
          // ignore storage errors
        }
      }
    },
    []
  );

  return { checkAndNotify, notificationsEnabled };
}
