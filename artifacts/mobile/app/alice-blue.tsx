import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  fetchAliceBluePositions,
  fetchAliceBlueMarketData,
  type Position,
  type MarketData,
} from "@/utils/aliceBlueData";

const PROFIT_COLOR = "#22C55E";
const LOSS_COLOR = "#EF4444";

function PositionCard({
  position,
  colors,
}: {
  position: Position;
  colors: ReturnType<typeof useColors>;
}) {
  const isProfitable = position.pnl >= 0;
  const pnlColor = isProfitable ? PROFIT_COLOR : LOSS_COLOR;

  return (
    <View style={[styles.positionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.positionHeader}>
        <View>
          <Text style={[styles.positionSymbol, { color: colors.foreground }]}>
            {position.symbol}
          </Text>
          <Text style={[styles.positionQty, { color: colors.mutedForeground }]}>
            Qty: {position.qty ?? 0} @ ₹{(position.avgPrice ?? 0).toFixed(2)}
          </Text>
        </View>
        <View style={styles.positionPnL}>
          <Text style={[styles.positionPrice, { color: colors.foreground }]}>
            ₹{(position.currentPrice ?? 0).toFixed(2)}
          </Text>
          <Text style={[styles.positionPnLText, { color: pnlColor }]}>
            {isProfitable ? "+" : ""}₹{(position.pnl ?? 0).toFixed(2)} ({(position.pnlPercent ?? 0).toFixed(2)}%)
          </Text>
        </View>
      </View>
    </View>
  );
}

function MarketDataCard({
  data,
  colors,
}: {
  data: MarketData;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.marketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.marketHeader}>
        <Text style={[styles.marketSymbol, { color: colors.foreground }]}>
          {data.symbol}
        </Text>
        <Text style={[styles.marketLTP, { color: colors.primary }]}>
          ₹{(data.ltp ?? 0).toFixed(2)}
        </Text>
      </View>
      <View style={styles.marketDetails}>
        <View style={styles.detail}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>High</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>₹{(data.high ?? 0).toFixed(2)}</Text>
        </View>
        <View style={styles.detail}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Low</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>₹{(data.low ?? 0).toFixed(2)}</Text>
        </View>
        <View style={styles.detail}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Volume</Text>
          <Text style={[styles.value, { color: colors.foreground }]}>{data.volume}</Text>
        </View>
      </View>
    </View>
  );
}

export default function AliceBlueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const {
    data: positions,
    isLoading: posLoading,
    isError: posError,
    refetch: refetchPos,
  } = useQuery<Position[]>({
    queryKey: ["alice-positions"],
    queryFn: () => fetchAliceBluePositions(),
    refetchInterval: 30000,
    retry: 1,
  });

  const {
    data: marketData,
    isLoading: marketLoading,
    isError: marketError,
    refetch: refetchMarket,
  } = useQuery<MarketData>({
    queryKey: ["alice-market", "BANKNIFTY"],
    queryFn: () => fetchAliceBlueMarketData("BANKNIFTY"),
    refetchInterval: 5000,
    retry: 1,
  });

  const handleRefresh = useCallback(() => {
    refetchPos();
    refetchMarket();
  }, [refetchPos, refetchMarket]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            paddingBottom: 14,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Alice Blue Live</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Real-time market data
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleRefresh}
          style={[styles.iconBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather
            name="refresh-cw"
            size={16}
            color={posLoading || marketLoading ? colors.mutedForeground : colors.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={posLoading || marketLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Market Data Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Market Data</Text>
          {marketError ? (
            <View style={[styles.errorBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="alert-circle" size={20} color={LOSS_COLOR} />
              <Text style={[styles.errorText, { color: colors.foreground }]}>
                Failed to fetch market data
              </Text>
            </View>
          ) : marketLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : marketData ? (
            <MarketDataCard data={marketData} colors={colors} />
          ) : null}
        </View>

        {/* Positions Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Positions</Text>
          {posError ? (
            <View style={[styles.errorBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="alert-circle" size={20} color={LOSS_COLOR} />
              <Text style={[styles.errorText, { color: colors.foreground }]}>
                Failed to fetch positions
              </Text>
            </View>
          ) : posLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : positions && positions.length > 0 ? (
            positions.map((pos, idx) => (
              <PositionCard key={idx} position={pos} colors={colors} />
            ))
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="inbox" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No open positions
              </Text>
            </View>
          )}
        </View>
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
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  positionCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  positionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  positionSymbol: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  positionQty: {
    fontSize: 12,
    marginTop: 4,
  },
  positionPrice: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  positionPnL: {
    alignItems: "flex-end",
  },
  positionPnLText: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: "Inter_600SemiBold",
  },
  marketCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  marketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  marketSymbol: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  marketLTP: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  marketDetails: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  detail: {
    alignItems: "center",
  },
  label: {
    fontSize: 11,
    marginBottom: 4,
  },
  value: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  errorBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  emptyBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
  },
});
