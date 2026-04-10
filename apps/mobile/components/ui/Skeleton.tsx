/**
 * Skeleton loader with shimmer animation.
 *
 * A drop-in placeholder for content that's still loading. Uses a horizontal
 * gradient that slides across the surface to create a "shimmer" effect.
 *
 * Usage:
 *   <Skeleton width="100%" height={20} />
 *   <Skeleton width={120} height={120} radius={12} />
 *   <SkeletonText lines={3} />
 *   <SkeletonCard />
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
  /** Background colour of the skeleton (the dimmer base). */
  baseColor?: string;
  /** Highlight colour that travels across the skeleton. */
  highlightColor?: string;
  /** Animation duration in milliseconds. */
  duration?: number;
}

const DEFAULT_BASE = '#1a1a2e';
const DEFAULT_HIGHLIGHT = '#26263d';

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 6,
  style,
  baseColor = DEFAULT_BASE,
  highlightColor = DEFAULT_HIGHLIGHT,
  duration = 1400,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 400],
  });

  return (
    <View
      style={[
        styles.base,
        { width, height, borderRadius: radius, backgroundColor: baseColor },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            transform: [{ translateX }],
            backgroundColor: highlightColor,
            opacity: 0.55,
            width: 140,
          },
        ]}
      />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────── */

export interface SkeletonTextProps {
  /** Number of lines to render. */
  lines?: number;
  /** Width of the last line (the others are 100%). */
  lastLineWidth?: DimensionValue;
  /** Vertical gap between lines. */
  gap?: number;
  /** Height of each line. */
  lineHeight?: number;
  style?: ViewStyle;
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  gap = 8,
  lineHeight = 14,
  style,
}: SkeletonTextProps) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </View>
  );
}

/* ────────────────────────────────────────────────────────────── */

export interface SkeletonCardProps {
  showAvatar?: boolean;
  lines?: number;
  style?: ViewStyle;
}

/** A pre-composed skeleton for list/card rows. */
export function SkeletonCard({ showAvatar = true, lines = 2, style }: SkeletonCardProps) {
  return (
    <View style={[styles.card, style]}>
      {showAvatar && <Skeleton width={44} height={44} radius={22} />}
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton height={14} width="80%" />
        <SkeletonText lines={lines} lineHeight={11} gap={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141425',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e2e',
  },
});
