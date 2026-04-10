/**
 * StatCard — animated metric card with count-up animation, trend indicator
 * and optional sparkline.
 *
 * Drop into the dashboard, EOD report or POS home screen to surface a
 * key number. The value animates from its previous frame to the new one
 * whenever it changes — a small detail that makes the dashboard feel
 * "alive".
 *
 * Usage:
 *   <StatCard label="Sales Today" value={1247.5} prefix="$" trend={12.4} />
 *   <StatCard label="Orders" value={86} icon="receipt" color="#6366f1" />
 *   <StatCard label="Average" value={14.5} prefix="$" sparkline={[1,3,2,5,4,6,8]} />
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface StatCardProps {
  label: string;
  value: number;
  /** Number of decimals to show. Defaults to 0 for integers, 2 for floats. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Primary accent colour. Defaults to the indigo brand colour. */
  color?: string;
  /** Trend percent. Positive renders green ↑, negative red ↓. */
  trend?: number;
  /** Optional sparkline data. */
  sparkline?: number[];
  /** Animation duration in ms. Defaults to 900ms. */
  duration?: number;
  style?: ViewStyle;
}

export function StatCard({
  label,
  value,
  decimals,
  prefix,
  suffix,
  icon,
  color = '#6366f1',
  trend,
  sparkline,
  duration = 900,
  style,
}: StatCardProps) {
  const animated = useRef(new Animated.Value(0)).current;
  const previousValue = useRef(0);
  const [displayValue, setDisplayValue] = useState(0);

  const decimalPlaces =
    decimals != null ? decimals : Number.isInteger(value) ? 0 : 2;

  useEffect(() => {
    const start = previousValue.current;
    const end = value;
    animated.setValue(0);
    const listener = animated.addListener(({ value: t }) => {
      const current = start + (end - start) * t;
      setDisplayValue(current);
    });
    Animated.timing(animated, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      previousValue.current = end;
    });
    return () => {
      animated.removeListener(listener);
    };
  }, [value, duration, animated]);

  const formatted = `${prefix ?? ''}${displayValue
    .toFixed(decimalPlaces)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${suffix ?? ''}`;

  const trendUp = (trend ?? 0) >= 0;
  const trendColor = trendUp ? '#22c55e' : '#ef4444';
  const trendIcon: keyof typeof Ionicons.glyphMap = trendUp
    ? 'trending-up'
    : 'trending-down';

  return (
    <View style={[styles.card, { borderColor: `${color}55` }, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {icon && (
          <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
            <Ionicons name={icon} size={14} color={color} />
          </View>
        )}
      </View>

      <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatted}
      </Text>

      <View style={styles.footerRow}>
        {trend != null && (
          <View style={[styles.trendBadge, { backgroundColor: `${trendColor}1a` }]}>
            <Ionicons name={trendIcon} size={11} color={trendColor} />
            <Text style={[styles.trendText, { color: trendColor }]}>
              {Math.abs(trend).toFixed(1)}%
            </Text>
          </View>
        )}
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={color} />
        )}
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────── */

interface SparklineProps {
  data: number[];
  color: string;
}

/**
 * Tiny inline sparkline rendered with a row of vertical bars (no SVG
 * dependency). Each bar is normalised to the range of the data set.
 */
function Sparkline({ data, color }: SparklineProps) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.0001, max - min);

  return (
    <View style={styles.spark}>
      {data.map((v, i) => {
        const height = 4 + ((v - min) / range) * 16;
        return (
          <View
            key={i}
            style={{
              width: 3,
              height,
              backgroundColor: color,
              opacity: 0.45 + (i / data.length) * 0.55,
              borderRadius: 1,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    minWidth: 140,
    flex: 1,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 22,
    fontWeight: '900',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '800',
  },
  spark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 22,
    flex: 1,
    justifyContent: 'flex-end',
  },
});
