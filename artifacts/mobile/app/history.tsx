import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { router } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { loadHistory, clearHistory, type HistoryEntry } from "@/utils/signalHistory";

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function EntryCard({ entry, colors }: { entry: HistoryEntry; colors: ReturnType<typeof useColors> }) {
  const isCallNow = entry.to.toLowerCase().includes("call");
  const accentColor = isCallNow ? "#22C55E" : "#EF4444";
  const icon = isCallNow ? "trending-up" : "trending-down";

  return (
    <View style={[styles.entryCard, { backgroundColor: colors.card, borderColor: accentColor + "44" }]}>
      <View style={styles.entryHeader}>
        <View style={[styles.entryIconWrap, { backgroundColor: accentColor + "22" }]}>
          <Feather name={icon as any} size={18} color={accentColor} />
        </View>
        <View style={styles.entrySignalBlock}>
          <View style={styles.entrySignalRow}>
            <Text style={[styles.entryFrom, { color: colors.mutedForeground }]}>
              {entry.from.toUpperCase()}
            </Text>
            <Feather name="arrow-right" size={13} color={colors.mutedForeground} />
            <Text style={[styles.entryTo, { color: accentColor }]}>
              {entry.to.toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.entryPrice, { color: colors.foreground }]}>
            ₹{entry.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={styles.entryTimeBlock}>
          <Text style={[styles.entryTimeAgo, { color: colors.mutedForeground }]}>
            {timeAgo(entry.timestamp)}
          </Text>
        </View>
      </View>
      <Text style={[styles.entryTimestamp, { color: colors.mutedForeground }]}>
        {formatTimestamp(entry.timestamp)}
      </Text>
    </View>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const entries = await loadHistory();
    setHistory(entries);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const handleClear = useCallback(() => {
    Alert.alert(
      "Clear History",
      "This will permanently delete all signal change records. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearHistory();
            setHistory([]);
          },
        },
      ]
    );
  }, []);

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
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Signal History</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            {history.length} change{history.length !== 1 ? "s" : ""} recorded
          </Text>
        </View>
        {history.length > 0 && (
          <TouchableOpacity
            onPress={handleClear}
            style={[styles.clearBtn, { backgroundColor: colors.secondary }]}
          >
            <Feather name="trash-2" size={16} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? null : history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="chart-timeline-variant" size={56} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No changes yet</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Signal changes will appear here the moment your prediction flips — including the Nifty Bank price at that time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 24 }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => <EntryCard entry={item} colors={colors} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  clearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  list: {
    padding: 16,
  },
  entryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  entryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  entrySignalBlock: {
    flex: 1,
    gap: 3,
  },
  entrySignalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  entryFrom: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  entryTo: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  entryPrice: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  entryTimeBlock: {
    alignItems: "flex-end",
  },
  entryTimeAgo: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  entryTimestamp: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
