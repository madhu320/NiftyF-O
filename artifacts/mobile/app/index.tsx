import React, { useState, useCallback } from "react";
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
  const res = await fetch(`${RENDER_API_URL}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function SentimentBar({ score, colors }: { score: number; colors: ReturnType<typeof useColors> }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const barColor =
    clampedScore >= 65
      ? colors.primary
      : clampedScore >= 40
      ? colors.accent
      : colors.destructive;

  const label =
    clampedScore >= 65 ? "Bullish" : clampedScore >= 40 ? "Neutral" : "Bearish";

  return (
    <View style={styles.sentimentContainer}>
      <View style={styles.sentimentHeader}>
        <Text style={[styles.sentimentLabel, { color: colors.mutedForeground }]}>
          Market Sentiment
        </Text>
        <Text style={[styles.sentimentScore, { color: barColor }]}>
          {clampedScore.toFixed(1)}
          <Text style={[styles.sentimentScoreMax, { color: colors.mutedForeground }]}>
            /100
          </Text>
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            { width: `${clampedScore}%` as any, backgroundColor: barColor },
          ]}
        />
      </View>
      <View style={styles.sentimentFooter}>
        <Text style={[styles.sentimentTag, { color: barColor }]}>{label}</Text>
        <Text style={[styles.sentimentTagSmall, { color: colors.mutedForeground }]}>
          0 — Bearish · 50 — Neutral · 100 — Bullish
        </Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const { data, isLoading, isError, error, refetch } = useQuery<PredictionData>({
    queryKey: ["prediction"],
    queryFn: fetchPrediction,
    refetchInterval: 30000,
  });

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
  const predictionColor = isCall ? colors.primary : colors.destructive;
  const predictionIcon = isCall ? "trending-up" : "trending-down";

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
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            NIFTY BANK
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            F&O Signal Dashboard
          </Text>
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
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomPad + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading && !data ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Fetching signals...
            </Text>
          </View>
        ) : isError ? (
          <View style={styles.errorContainer}>
            <View
              style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.destructive }]}
            >
              <Ionicons name="warning-outline" size={40} color={colors.destructive} />
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>
                Connection Failed
              </Text>
              <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
                {RENDER_API_URL.includes("your-api")
                  ? "Set your Render API URL in constants/config.ts"
                  : (error as Error)?.message ?? "Unable to reach the prediction API"}
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
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardLabelRow}>
                <MaterialCommunityIcons
                  name="signal-cellular-3"
                  size={14}
                  color={colors.mutedForeground}
                />
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
                  Signal Prediction
                </Text>
              </View>
              <View style={styles.predictionRow}>
                <Feather name={predictionIcon as any} size={44} color={predictionColor} />
                <Text style={[styles.predictionText, { color: predictionColor }]}>
                  {data?.prediction?.toUpperCase() ?? "—"}
                </Text>
              </View>
              <View style={[styles.predictionBadge, { backgroundColor: predictionColor + "22" }]}>
                <Text style={[styles.predictionBadgeText, { color: predictionColor }]}>
                  {isCall ? "Buy Call Option" : "Buy Put Option"}
                </Text>
              </View>
            </View>

            {/* Price Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardLabelRow}>
                <MaterialCommunityIcons
                  name="currency-inr"
                  size={14}
                  color={colors.mutedForeground}
                />
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
                  Current Price
                </Text>
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
              <Text style={[styles.priceSubtext, { color: colors.mutedForeground }]}>
                Nifty Bank Index
              </Text>
            </View>

            {/* Sentiment Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {data?.sentiment != null ? (
                <SentimentBar score={data.sentiment} colors={colors} />
              ) : (
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
                  Sentiment data unavailable
                </Text>
              )}
            </View>

            {/* Live indicator */}
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.liveText, { color: colors.mutedForeground }]}>
                Auto-refreshes every 30 seconds
              </Text>
            </View>
          </>
        )}

        {/* INVEST NOW Button */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[styles.investBtn, { backgroundColor: colors.primary }]}
            onPress={handleInvestNow}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name="lightning-bolt"
              size={24}
              color={colors.primaryForeground}
            />
            <Text style={[styles.investBtnText, { color: colors.primaryForeground }]}>
              INVEST NOW
            </Text>
            <Text style={[styles.investBtnSub, { color: colors.primaryForeground + "BB" }]}>
              via Zerodha Kite
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  errorContainer: {
    paddingVertical: 20,
  },
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
  sentimentContainer: {
    gap: 10,
  },
  sentimentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sentimentLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sentimentScore: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  sentimentScoreMax: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  barFill: {
    height: 10,
    borderRadius: 5,
  },
  sentimentFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sentimentTag: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  sentimentTagSmall: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
    shadowColor: "#00D4AA",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
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
