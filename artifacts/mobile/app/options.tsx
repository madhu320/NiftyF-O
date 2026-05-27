import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  fetchOptionsChain,
  computePCR,
  findATMIndex,
  formatOI,
  type StrikeRow,
  type OptionsChainData,
} from "@/utils/optionsChain";
import { RENDER_API_URL } from "@/constants/config";

const CALL_COLOR = "#22C55E";
const PUT_COLOR = "#EF4444";
const ATM_COLOR = "#F5C518";

function OIBar({
  value,
  max,
  color,
  align,
}: {
  value: number;
  max: number;
  color: string;
  align: "left" | "right";
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View
      style={[
        styles.oiBarTrack,
        { flexDirection: align === "left" ? "row-reverse" : "row" },
      ]}
    >
      <View
        style={[
          styles.oiBarFill,
          { width: `${pct}%` as any, backgroundColor: color + "66" },
        ]}
      />
    </View>
  );
}

function StrikeCard({
  row,
  isATM,
  maxOI,
  colors,
  activeTab,
}: {
  row: StrikeRow;
  isATM: boolean;
  maxOI: number;
  colors: ReturnType<typeof useColors>;
  activeTab: "oi" | "greeks";
}) {
  const bg = isATM ? ATM_COLOR + "15" : colors.card;
  const strikeBorder = isATM ? ATM_COLOR + "66" : colors.border;
  // FIX: Dynamic card height based on tab - greeks needs 100px, OI needs 66px
  const cardHeight = activeTab === "greeks" ? 100 : 66;

  return (
    <View style={[styles.strikeCard, { backgroundColor: bg, borderColor: strikeBorder, height: cardHeight }]}>
      {/* CE side */}
      <View style={[styles.legCell, activeTab === "greeks" && { justifyContent: "space-between" }]}>
        {activeTab === "oi" ? (
          <>
            <Text style={[styles.legLTP, { color: CALL_COLOR }]}>
              ₹{(row.ce?.ltp ?? 0).toFixed(1)}
            </Text>
            <Text style={[styles.legOI, { color: colors.mutedForeground }]}>
              {formatOI(row.ce?.oi ?? 0)}
            </Text>
            <OIBar value={row.ce?.oi ?? 0} max={maxOI} color={CALL_COLOR} align="left" />
          </>
        ) : (
          <View style={{ flex: 1, justifyContent: "space-between" }}>
            <Text style={[styles.greekValue, { color: CALL_COLOR }]}>
              ₹{(row.ce?.ltp ?? 0).toFixed(1)}
            </Text>
            <Text style={[styles.greekIV, { color: colors.mutedForeground }]}>
              IV: {row.ce?.iv?.toFixed(1) ?? "—"}
            </Text>
            <View style={styles.greekRow}>
              <Text style={[styles.greekStat, { color: colors.foreground }]}>Δ {row.ce?.delta?.toFixed(2) ?? "—"}</Text>
              <Text style={[styles.greekStat, { color: colors.mutedForeground }]}>Θ {row.ce?.theta?.toFixed(2) ?? "—"}</Text>
            </View>
            <View style={styles.greekRow}>
              <Text style={[styles.greekStat, { color: colors.mutedForeground }]}>Γ {row.ce?.gamma?.toFixed(4) ?? "—"}</Text>
              <Text style={[styles.greekStat, { color: colors.mutedForeground }]}>ν {row.ce?.vega?.toFixed(2) ?? "—"}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Strike */}
      <View style={styles.strikeCell}>
        {isATM && (
          <Text style={[styles.atmTag, { color: ATM_COLOR }]}>ATM</Text>
        )}
        <Text style={[styles.strikeText, { color: isATM ? ATM_COLOR : colors.foreground }]}>
          {row.strike.toLocaleString("en-IN")}
        </Text>
      </View>

      {/* PE side */}
      <View style={[styles.legCell, styles.legRight, activeTab === "greeks" && { justifyContent: "space-between" }]}>
        {activeTab === "oi" ? (
          <>
            <Text style={[styles.legLTP, { color: PUT_COLOR }]}>
              ₹{(row.pe?.ltp ?? 0).toFixed(1)}
            </Text>
            <Text style={[styles.legOI, { color: colors.mutedForeground }]}>
              {formatOI(row.pe?.oi ?? 0)}
            </Text>
            <OIBar value={row.pe?.oi ?? 0} max={maxOI} color={PUT_COLOR} align="right" />
          </>
        ) : (
          <View style={{ flex: 1, justifyContent: "space-between" }}>
            <Text style={[styles.greekValue, { color: PUT_COLOR }]}>
              ₹{(row.pe?.ltp ?? 0).toFixed(1)}
            </Text>
            <Text style={[styles.greekIV, { color: colors.mutedForeground }]}>
              IV: {row.pe?.iv?.toFixed(1) ?? "—"}
            </Text>
            <View style={[styles.greekRow, { justifyContent: 'flex-end' }]}>
              <Text style={[styles.greekStat, { color: colors.mutedForeground }]}>Θ {row.pe?.theta?.toFixed(2) ?? "—"}</Text>
              <Text style={[styles.greekStat, { color: colors.foreground }]}>Δ {row.pe?.delta?.toFixed(2) ?? "—"}</Text>
            </View>
            <View style={[styles.greekRow, { justifyContent: 'flex-end' }]}>
              <Text style={[styles.greekStat, { color: colors.mutedForeground }]}>ν {row.pe?.vega?.toFixed(2) ?? "—"}</Text>
              <Text style={[styles.greekStat, { color: colors.mutedForeground }]}>Γ {row.pe?.gamma?.toFixed(4) ?? "—"}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function PCRBadge({ pcr, colors }: { pcr: number; colors: ReturnType<typeof useColors> }) {
  const label = pcr > 1.2 ? "Bullish" : pcr < 0.8 ? "Bearish" : "Neutral";
  const color = pcr > 1.2 ? CALL_COLOR : pcr < 0.8 ? PUT_COLOR : ATM_COLOR;
  return (
    <View style={[styles.pcrRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View>
        <Text style={[styles.pcrLabel, { color: colors.mutedForeground }]}>Put-Call Ratio (OI)</Text>
        <Text style={[styles.pcrValue, { color }]}>
          {(pcr ?? 0).toFixed(2)}
          <Text style={[styles.pcrSentiment, { color }]}> · {label}</Text>
        </Text>
      </View>
      <MaterialCommunityIcons
        name={pcr > 1.2 ? "trending-up" : pcr < 0.8 ? "trending-down" : "minus"}
        size={28}
        color={color}
      />
    </View>
  );
}

export default function OptionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedExpiry, setSelectedExpiry] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"oi" | "greeks">("oi");

  const { data, isLoading, isError, error, refetch } = useQuery<OptionsChainData>({
    queryKey: ["options-chain", selectedExpiry],
    queryFn: () => fetchOptionsChain(selectedExpiry),
    refetchInterval: 60000,
    retry: 1,
  });

  useEffect(() => {
    if (!selectedExpiry && data?.expiry) {
      setSelectedExpiry(data.expiry);
    }
  }, [data?.expiry, selectedExpiry]);

  const strikes = data?.strikes || [];
  const atm = strikes.length > 0 && data?.spot ? findATMIndex(strikes, data.spot) : -1;
  const maxOI = strikes.length > 0
    ? Math.max(...strikes.flatMap((s) => [s.ce?.oi || 0, s.pe?.oi || 0]), 1)
    : 1;
  const pcr = strikes.length > 0 ? computePCR(strikes) : 0;
  const expiries = data?.availableExpiries?.length ? data.availableExpiries : data?.expiry ? [data.expiry] : [];

  const renderItem = useCallback(
    ({ item, index }: { item: StrikeRow; index: number }) => (
      <StrikeCard
        row={item}
        isATM={index === atm}
        maxOI={maxOI}
        colors={colors}
        activeTab={activeTab}
      />
    ),
    [atm, maxOI, colors, activeTab]
  );

  const is404 = isError && (error as Error)?.message?.includes("404");

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
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Options Chain</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {data ? `Expiry: ${data.expiry}  ·  Spot ₹${data.spot.toLocaleString("en-IN")}` : "Nifty Bank · NSE"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.iconBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="refresh-cw" size={16} color={isLoading ? colors.mutedForeground : colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading options chain…
          </Text>
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          {is404 ? (
            <>
              <MaterialCommunityIcons name="api-off" size={52} color={colors.border} />
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>
                Endpoint Not Found
              </Text>
              <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
                Add a{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                  GET /options-chain
                </Text>{" "}
                route to your Render API that returns strikes with CE/PE OI, LTP, and volume.
              </Text>
              <Text style={[styles.errorUrl, { color: colors.mutedForeground }]}>
                {RENDER_API_URL}/options-chain
              </Text>
            </>
          ) : (
            <>
              <Feather name="wifi-off" size={44} color="#EF4444" />
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>
                Connection Failed
              </Text>
              <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
                {(error as Error)?.message}
              </Text>
            </>
          )}
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          >
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Expiry Tabs */}
          {expiries.length > 0 && (
            <View style={styles.expiryWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.expiryContainer}
              >
                {expiries.map((exp: string) => {
                  const isSelected = (selectedExpiry || data?.expiry) === exp;
                  return (
                    <TouchableOpacity
                      key={exp}
                      style={[
                        styles.expiryTab,
                        { backgroundColor: isSelected ? colors.primary : colors.secondary }
                      ]}
                      onPress={() => setSelectedExpiry(exp)}
                    >
                      <Text style={[styles.expiryTabText, { color: isSelected ? "#fff" : colors.foreground }]}>
                        {exp}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* PCR summary */}
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <PCRBadge pcr={pcr} colors={colors} />
          </View>

          {/* Theoretical data disclaimer */}
          {data?.theoretical && (
            <View style={[styles.theoreticalBanner, { backgroundColor: "#F5C51815", borderColor: "#F5C51840" }]}>
              <Feather name="info" size={12} color="#F5C518" />
              <Text style={styles.theoreticalText}>
                Prices are Black-Scholes estimates using live spot · OI is modelled
              </Text>
            </View>
          )}

          {/* View Toggle Tabs */}
          <View style={[styles.tabsContainer, { backgroundColor: colors.secondary }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "oi" && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab("oi")}
            >
              <Text style={[styles.tabText, { color: activeTab === "oi" ? "#fff" : colors.mutedForeground }]}>OI & Price</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "greeks" && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab("greeks")}
            >
              <Text style={[styles.tabText, { color: activeTab === "greeks" ? "#fff" : colors.mutedForeground }]}>Greeks & IV</Text>
            </TouchableOpacity>
          </View>

          {/* Column headers */}
          <View style={styles.colHeader}>
            <Text style={[styles.colLabel, { color: CALL_COLOR, flex: 1 }]}>{activeTab === "oi" ? "CALL" : "CE GREEKS"}</Text>
            <Text style={[styles.colLabel, { color: colors.mutedForeground, width: 80, textAlign: "center" }]}>
              STRIKE
            </Text>
            <Text style={[styles.colLabel, { color: PUT_COLOR, flex: 1, textAlign: "right" }]}>{activeTab === "oi" ? "PUT" : "PE GREEKS"}</Text>
          </View>

          {strikes.length > 0 ? (
            <FlatList
              data={strikes}
              keyExtractor={(item) => String(item.strike)}
              renderItem={renderItem}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 24 }]}
              showsVerticalScrollIndicator={false}
              initialScrollIndex={atm > 2 ? atm - 2 : 0}
              // FIX: Dynamic height based on active tab (greeks=100px, oi=66px) plus gap=6px
              getItemLayout={(_, index) => {
                const itemHeight = activeTab === "greeks" ? 100 : 66;
                const gap = 6;
                const totalHeight = itemHeight + gap;
                return { length: totalHeight, offset: totalHeight * index, index };
              }}
            />
          ) : (
            <View style={[styles.centered, { paddingVertical: 40 }]}>
              <Feather name="inbox" size={32} color={colors.border} style={{ marginBottom: 8 }} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
                No strikes available for this expiry.
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
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
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  pcrRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  pcrLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  pcrValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  pcrSentiment: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  colLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 6,
  },
  theoreticalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  theoreticalText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#F5C518",
    flex: 1,
  },
  strikeCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  legCell: {
    flex: 1,
    gap: 2,
  },
  legRight: {
    alignItems: "flex-end",
  },
  legLTP: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  legOI: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  oiBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "transparent",
    width: "100%",
    marginTop: 2,
  },
  oiBarFill: {
    height: 4,
    borderRadius: 2,
  },
  strikeCell: {
    width: 80,
    alignItems: "center",
    gap: 2,
  },
  atmTag: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  strikeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  expiryWrapper: {
    marginTop: 12,
    minHeight: 40,
  },
  expiryContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  expiryTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  expiryTabText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  greekRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  greekValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  greekIV: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginVertical: 1,
  },
  greekStat: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
