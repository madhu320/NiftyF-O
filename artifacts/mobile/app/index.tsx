import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Platform,
  Animated,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useSignalNotifications } from "@/hooks/useSignalNotifications";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { PriceChart } from "@/components/PriceChart";
import { appendPriceReading, loadPriceHistory, type PriceReading } from "@/utils/priceHistory";
import { RENDER_API_URL, ZERODHA_KITE_URL } from "@/constants/config";

interface PredictionData {
  prediction: string;
  price: number;
  sentiment?: number;
  blendedScore?: number;
  modelScore?: number;
  ruleScore?: number;
  modelPrediction?: string;
  modelConfidence?: number;
  tradeSignal?: string;
}

async function fetchPrediction(): Promise<PredictionData> {
  const res = await fetch(`${RENDER_API_URL}/predict`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function pingRender(): Promise<void> {
  try {
    await fetch(`${RENDER_API_URL}/predict`, { method: "HEAD" });
  } catch {
    // ping is best-effort — ignore failures
  }
}

function getSentimentInfo(score: number) {
  if (score >= 60) return { label: "Positive", color: "#22C55E", bg: "#22C55E22", icon: "arrow-up-circle" as const };
  if (score >= 40) return { label: "Neutral", color: "#F5C518", bg: "#F5C51822", icon: "minus-circle" as const };
  return { label: "Negative", color: "#EF4444", bg: "#EF444422", icon: "arrow-down-circle" as const };
}

function SentimentGauge({ score, colors }: { score: number; colors: ReturnType<typeof useColors> }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const { label, color, bg, icon } = getSentimentInfo(clampedScore);
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: clampedScore,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [clampedScore]);

  return (
    <View style={styles.sentimentContainer}>
      <View style={styles.sentimentHeader}>
        <View style={styles.cardLabelRow}>
          <MaterialCommunityIcons name="speedometer" size={14} color={colors.mutedForeground} />
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Market Sentiment</Text>
        </View>
        <Text style={[styles.sentimentScore, { color }]}>
          {clampedScore.toFixed(1)}
          <Text style={[styles.sentimentScoreMax, { color: colors.mutedForeground }]}>/100</Text>
        </Text>
      </View>

      {/* Color-coded badge */}
      <View style={[styles.sentimentBadge, { backgroundColor: bg }]}>
        <Feather name={icon} size={18} color={color} />
        <Text style={[styles.sentimentBadgeText, { color }]}>{label}</Text>
      </View>

      {/* Animated gradient bar */}
      <View style={[styles.gaugeTrack, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            styles.gaugeFill,
            {
              width: animWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
              backgroundColor: color,
            },
          ]}
        />
        {/* Threshold markers */}
        <View style={[styles.gaugeMarker, { left: "40%" }]} />
        <View style={[styles.gaugeMarker, { left: "60%" }]} />
      </View>

      <View style={styles.gaugeLabels}>
        <Text style={[styles.gaugeLabel, { color: "#EF4444" }]}>Negative</Text>
        <Text style={[styles.gaugeLabel, { color: "#F5C518" }]}>Neutral</Text>
        <Text style={[styles.gaugeLabel, { color: "#22C55E" }]}>Positive</Text>
      </View>
    </View>
  );
}

const WARMUP_SECONDS = 30;
const FETCH_INTERVAL_MS = 30000;

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [fetchEnabled, setFetchEnabled] = useState(false);
  const [warmSecondsLeft, setWarmSecondsLeft] = useState(WARMUP_SECONDS);
  const [priceReadings, setPriceReadings] = useState<PriceReading[]>([]);
  const [chartWidth, setChartWidth] = useState(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { checkAndNotify, notificationsEnabled } = useSignalNotifications();
  const market = useMarketStatus();

  // Load stored price history on mount
  useEffect(() => {
    loadPriceHistory().then(setPriceReadings);
  }, []);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery<PredictionData>({
    queryKey: ["prediction"],
    queryFn: fetchPrediction,
    enabled: fetchEnabled,
    refetchInterval: fetchEnabled ? FETCH_INTERVAL_MS : false,
  });

  // Warmup: ping immediately, enable fetch after 30 s, then keep pinging every 30 s
  useEffect(() => {
    pingRender();

    let secondsLeft = WARMUP_SECONDS;
    const countdownId = setInterval(() => {
      secondsLeft -= 1;
      setWarmSecondsLeft(secondsLeft);
      if (secondsLeft <= 0) clearInterval(countdownId);
    }, 1000);

    const enableId = setTimeout(() => {
      setFetchEnabled(true);
    }, WARMUP_SECONDS * 1000);

    // After warmup, ping every 30 s (fires 30 s before each subsequent fetch)
    const pingId = setInterval(() => {
      pingRender();
    }, FETCH_INTERVAL_MS);

    return () => {
      clearInterval(countdownId);
      clearTimeout(enableId);
      clearInterval(pingId);
    };
  }, []);

  useEffect(() => {
    if (data?.prediction != null && data?.price != null) {
      checkAndNotify(data.prediction, data.price);
    }
  }, [data?.prediction, data?.price]);

  // Append price reading every time a new price arrives
  useEffect(() => {
    if (data?.price != null) {
      appendPriceReading(data.price).then(setPriceReadings);
    }
  }, [data?.price, dataUpdatedAt]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleInvestNow = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    await Linking.openURL(ZERODHA_KITE_URL);
  }, [scaleAnim]);

  const isCall = data?.tradeSignal === "BUY" || data?.prediction?.toLowerCase() === "call";
  const isSell = data?.tradeSignal === "SELL" || data?.prediction?.toLowerCase() === "put";
  const predictionColor = isCall ? "#22C55E" : isSell ? "#EF4444" : "#F59E0B";
  const predictionIcon = isCall ? "trending-up" : isSell ? "trending-down" : "minus";
  const blendedScore = data?.blendedScore ?? data?.sentiment ?? 50;
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            paddingBottom: 16,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>NIFTY BANK</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>F&O Signal Dashboard</Text>
        </View>
        <View style={styles.headerActions}>
          {Platform.OS !== "web" && (
            <View style={[styles.bellBadge, { backgroundColor: colors.secondary }]}>
              <Feather
                name={notificationsEnabled ? "bell" : "bell-off"}
                size={16}
                color={notificationsEnabled ? "#22C55E" : colors.mutedForeground}
              />
            </View>
          )}
          <TouchableOpacity
            onPress={() => router.push("/history")}
            style={[styles.refreshBtn, { backgroundColor: colors.secondary }]}
          >
            <Feather name="clock" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRefresh}
            style={[styles.refreshBtn, { backgroundColor: colors.secondary }]}
            disabled={isLoading || refreshing}
          >
            <Feather
              name="refresh-cw"
              size={18}
              color={isLoading || refreshing ? colors.mutedForeground : colors.primary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Warm-up banner — visible during the 30 s countdown */}
        {!fetchEnabled && (
          <View style={[styles.warmupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.warmupRow}>
              <MaterialCommunityIcons name="fire" size={20} color="#F5C518" />
              <Text style={[styles.warmupTitle, { color: colors.foreground }]}>Waking up server…</Text>
            </View>
            <Text style={[styles.warmupSub, { color: colors.mutedForeground }]}>
              A ping was sent to your Render API. Signal data will load in{" "}
              <Text style={{ color: "#F5C518", fontFamily: "Inter_700Bold" }}>{warmSecondsLeft}s</Text>
            </Text>
            <View style={[styles.warmupTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.warmupFill,
                  {
                    width: `${((WARMUP_SECONDS - warmSecondsLeft) / WARMUP_SECONDS) * 100}%` as any,
                    backgroundColor: "#F5C518",
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Market Status Card */}
        <View style={[styles.marketCard, { backgroundColor: market.bg, borderColor: market.color + "55" }]}>
          <View style={styles.marketLeft}>
            <View style={[styles.marketDot, { backgroundColor: market.color }]} />
            <View>
              <Text style={[styles.marketLabel, { color: market.color }]}>{market.label}</Text>
              <Text style={[styles.marketSub, { color: colors.mutedForeground }]}>NSE · India</Text>
            </View>
          </View>
          <View style={styles.marketRight}>
            <Text style={[styles.marketNext, { color: colors.mutedForeground }]}>{market.nextEventLabel}</Text>
            <Text style={[styles.marketNextTime, { color: market.color }]}>{market.nextEventTime}</Text>
          </View>
        </View>

        {isLoading && !data ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Fetching signals...</Text>
          </View>
        ) : isError ? (
          <View style={styles.errorContainer}>
            <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: "#EF4444" }]}>
              <Ionicons name="warning-outline" size={40} color="#EF4444" />
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>Connection Failed</Text>
              <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
                {(error as Error)?.message ?? "Unable to reach the prediction API"}
              </Text>
              <Text style={[styles.errorUrl, { color: colors.mutedForeground }]}>
                {RENDER_API_URL}/predict
              </Text>
              <TouchableOpacity
                onPress={() => refetch()}
                style={[styles.retryBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                <Feather name="refresh-cw" size={14} color={colors.primary} />
                <Text style={[styles.retryBtnText, { color: colors.primary }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Prediction Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: predictionColor + "55",
                  borderWidth: 1.5,
                },
              ]}
            >
              <View style={styles.cardLabelRow}>
                <MaterialCommunityIcons name="signal-cellular-3" size={14} color={colors.mutedForeground} />
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Signal Prediction</Text>
              </View>
              <View style={styles.predictionRow}>
                <View style={[styles.predictionIconWrap, { backgroundColor: predictionColor + "22" }]}>
                  <Feather name={predictionIcon as any} size={36} color={predictionColor} />
                </View>
                <Text style={[styles.predictionText, { color: predictionColor }]}>
                  {data?.prediction?.toUpperCase() ?? "—"}
                </Text>
              </View>
              <View style={[styles.predictionBadge, { backgroundColor: predictionColor + "22" }]}>
                <Text style={[styles.predictionBadgeText, { color: predictionColor }]}>
                  {isCall ? "▲ Buy Call Option" : isSell ? "▼ Buy Put Option" : "○ Hold / Wait"}
                </Text>
              </View>
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Blended Score</Text>
                <Text style={[styles.predictionText, { color: predictionColor, marginTop: 4 }]}> {blendedScore?.toFixed?.(0) ?? "—"} / 100</Text>
                <Text style={[styles.cardLabel, { color: colors.mutedForeground, marginTop: 8 }]}>Model</Text>
                <Text style={[styles.priceSubtext, { color: colors.foreground }]}>Prediction: {data?.modelPrediction ?? "—"}</Text>
                <Text style={[styles.priceSubtext, { color: colors.mutedForeground }]}>Confidence: {data?.modelConfidence?.toFixed?.(1) ?? "0"}%</Text>
                <Text style={[styles.priceSubtext, { color: colors.mutedForeground }]}>Rule Score: {data?.ruleScore ?? "—"} / 100</Text>
                <Text style={[styles.priceSubtext, { color: colors.mutedForeground }]}>Model Score: {data?.modelScore ?? "—"} / 100</Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}> 
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Prediction Blend</Text>
              <Text style={[styles.priceText, { color: colors.foreground, marginTop: 8 }]}>60% rule-based + 40% Python XGBoost</Text>
              <Text style={[styles.priceSubtext, { color: colors.mutedForeground, marginTop: 10 }]}>The app combines Alice Blue technical rules with a Python ML model score to generate the final signal.</Text>
            </View>

            {/* Price Card */}
            <View
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onLayout={(e: LayoutChangeEvent) =>
                setChartWidth(e.nativeEvent.layout.width - 40)
              }
            >
              <View style={styles.cardLabelRow}>
                <MaterialCommunityIcons name="currency-inr" size={14} color={colors.mutedForeground} />
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Current Price</Text>
              </View>
              <Text style={[styles.priceText, { color: colors.foreground }]}>
                ₹
                {data?.price != null
                  ? Number(data.price).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </Text>
              <Text style={[styles.priceSubtext, { color: colors.mutedForeground }]}>Nifty Bank Index</Text>

              {chartWidth > 0 && (
                <View style={styles.chartWrapper}>
                  <PriceChart
                    readings={priceReadings}
                    width={chartWidth}
                    height={130}
                    colors={{
                      primary: "#22C55E",
                      destructive: "#EF4444",
                      mutedForeground: colors.mutedForeground,
                      border: colors.border,
                      foreground: colors.foreground,
                    }}
                  />
                </View>
              )}
            </View>

            {/* Sentiment Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {data?.sentiment != null ? (
                <SentimentGauge score={data.sentiment} colors={colors} />
              ) : (
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
                  Sentiment data unavailable
                </Text>
              )}
            </View>

            {/* Live status */}
            <View style={styles.liveRow}>
              <Animated.View
                style={[
                  styles.liveDot,
                  { backgroundColor: "#22C55E", transform: [{ scale: pulseAnim }] },
                ]}
              />
              <Text style={[styles.liveText, { color: colors.mutedForeground }]}>
                {lastUpdated ? `Updated at ${lastUpdated}` : "Auto-refreshes every 30s"}
              </Text>
            </View>
          </>
        )}

        {/* Options Chain Entry */}
        <TouchableOpacity
          style={[styles.optionsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/options")}
          activeOpacity={0.75}
        >
          <View style={styles.optionsBtnLeft}>
            <MaterialCommunityIcons name="table-eye" size={20} color={colors.primary} />
            <View>
              <Text style={[styles.optionsBtnTitle, { color: colors.foreground }]}>Options Chain</Text>
              <Text style={[styles.optionsBtnSub, { color: colors.mutedForeground }]}>
                OI · LTP · PCR · Strikes
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Alice Blue Live Data Entry */}
        <TouchableOpacity
          style={[styles.optionsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/alice-blue")}
          activeOpacity={0.75}
        >
          <View style={styles.optionsBtnLeft}>
            <MaterialCommunityIcons name="chart-line" size={20} color="#3B82F6" />
            <View>
              <Text style={[styles.optionsBtnTitle, { color: colors.foreground }]}>Alice Blue Live</Text>
              <Text style={[styles.optionsBtnSub, { color: colors.mutedForeground }]}>
                Positions · Market Data
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* INVEST NOW Button */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[styles.investBtn, { backgroundColor: "#22C55E" }]}
            onPress={handleInvestNow}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="lightning-bolt" size={26} color="#0A0F1E" />
            <Text style={[styles.investBtnText, { color: "#0A0F1E" }]}>INVEST NOW</Text>
            <Text style={[styles.investBtnSub, { color: "#0A0F1EBB" }]}>via Zerodha Kite</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bellBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorContainer: { paddingVertical: 20 },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  errorMsg: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  errorUrl: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    opacity: 0.6,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 6,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  cardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  predictionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  predictionIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  predictionText: {
    fontSize: 52,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  predictionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  predictionBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  priceText: {
    fontSize: 38,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  priceSubtext: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  chartWrapper: {
    marginTop: 16,
  },
  sentimentContainer: { gap: 12 },
  sentimentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sentimentScore: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  sentimentScoreMax: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sentimentBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sentimentBadgeText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  gaugeTrack: {
    height: 14,
    borderRadius: 7,
    overflow: "hidden",
    position: "relative",
  },
  gaugeFill: {
    height: 14,
    borderRadius: 7,
  },
  gaugeMarker: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  gaugeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  gaugeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  marketCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  marketLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  marketDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  marketLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  marketSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  marketRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  marketNext: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  marketNextTime: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  warmupCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  warmupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  warmupTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  warmupSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  warmupTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
  },
  warmupFill: {
    height: 6,
    borderRadius: 3,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  optionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  optionsBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionsBtnTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  optionsBtnSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  investBtn: {
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 8,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  investBtnText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 3,
  },
  investBtnSub: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
});
