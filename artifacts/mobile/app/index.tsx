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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { RENDER_API_URL, ZERODHA_KITE_URL } from "@/constants/config";

interface PredictionData {
  prediction: string;
  price: number;
  sentiment: number;
}

async function fetchPrediction(): Promise<PredictionData> {
  const res = await fetch(`${RENDER_API_URL}/predict`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery<PredictionData>({
    queryKey: ["prediction"],
    queryFn: fetchPrediction,
    refetchInterval: 30000,
  });

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

  const isCall = data?.prediction?.toLowerCase() === "call";
  const predictionColor = isCall ? "#22C55E" : "#EF4444";
  const predictionIcon = isCall ? "trending-up" : "trending-down";
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

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
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
                  {isCall ? "▲ Buy Call Option" : "▼ Buy Put Option"}
                </Text>
              </View>
            </View>

            {/* Price Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
