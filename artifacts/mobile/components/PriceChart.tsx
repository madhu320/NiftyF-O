import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Rect } from "react-native-svg";

interface PriceReading {
  timestamp: number;
  price: number;
}

interface PriceChartProps {
  readings: PriceReading[];
  width: number;
  height?: number;
  colors: {
    primary: string;
    destructive: string;
    mutedForeground: string;
    border: string;
    foreground: string;
  };
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function PriceChart({ readings, width, height = 120, colors }: PriceChartProps) {
  if (readings.length < 2) {
    return (
      <View style={[styles.placeholder, { height, width }]}>
        <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>
          Chart builds after 2+ readings
        </Text>
      </View>
    );
  }

  const padL = 4;
  const padR = 4;
  const padT = 10;
  const padB = 22;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const prices = readings.map((r) => r.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const toX = (i: number) => padL + (i / (readings.length - 1)) * chartW;
  const toY = (p: number) => padT + chartH - ((p - minPrice) / priceRange) * chartH;

  const points = readings.map((r, i) => ({ x: toX(i), y: toY(r.price) }));

  // Smooth line using quadratic bezier curves
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const mx = (prev.x + curr.x) / 2;
    linePath += ` Q ${mx} ${prev.y} ${curr.x} ${curr.y}`;
  }

  // Fill area below line
  const fillPath =
    linePath +
    ` L ${points[points.length - 1].x} ${padT + chartH}` +
    ` L ${points[0].x} ${padT + chartH} Z`;

  const isUp = readings[readings.length - 1].price >= readings[0].price;
  const lineColor = isUp ? colors.primary : colors.destructive;
  const gradientId = isUp ? "gradientUp" : "gradientDown";

  const lastPoint = points[points.length - 1];
  const firstTime = formatTime(readings[0].timestamp);
  const lastTime = formatTime(readings[readings.length - 1].timestamp);

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="gradientUp" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="gradientDown" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.destructive} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={colors.destructive} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Fill */}
        <Path d={fillPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* Latest price dot */}
        <Circle cx={lastPoint.x} cy={lastPoint.y} r={4} fill={lineColor} />
        <Circle cx={lastPoint.x} cy={lastPoint.y} r={7} fill={lineColor} fillOpacity={0.2} />
      </Svg>

      {/* Time axis labels */}
      <View style={[styles.timeRow, { width }]}>
        <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>{firstTime}</Text>
        <Text style={[styles.priceRange, { color: colors.mutedForeground }]}>
          ₹{formatPrice(minPrice)} – ₹{formatPrice(maxPrice)}
        </Text>
        <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>{lastTime}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  timeLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  priceRange: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
});
