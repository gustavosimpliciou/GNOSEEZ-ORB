import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ReactionsPanelProps {
  reacoes: readonly string[];
  reacaoLabel: string;
  intensity: number;
  isActive: boolean;
  accentColor: string;
  darkMode: boolean;
  topOffset: number;
}

const THRESHOLDS = [50, 35, 20, 60, 10, 45, 15];
const USE_NATIVE = Platform.OS !== "web";

function ReactionRow({
  label,
  active,
  accentColor,
  darkMode,
}: {
  label: string;
  active: boolean;
  accentColor: string;
  darkMode: boolean;
}) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0)).current;
  const height = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: active ? 1 : 0,
        duration: active ? 350 : 250,
        useNativeDriver: USE_NATIVE,
      }),
      Animated.timing(height, {
        toValue: active ? 1 : 0,
        duration: active ? 320 : 220,
        useNativeDriver: false,
      }),
    ]).start();
  }, [active]);

  const fg = (a: number) =>
    darkMode ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  const rowHeight = height.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 22],
  });

  return (
    <Animated.View
      style={[styles.reactionRow, { opacity, height: rowHeight, overflow: "hidden" }]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: active ? accentColor : fg(0.28) },
        ]}
      />
      <Text style={[styles.reactionText, { color: fg(0.72) }]}>
        {label.toUpperCase()}
      </Text>
    </Animated.View>
  );
}

export default function ReactionsPanel({
  reacoes,
  reacaoLabel,
  intensity,
  isActive,
  accentColor,
  darkMode,
  topOffset,
}: ReactionsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const slideX = useRef(new Animated.Value(-168)).current;
  const toggleOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideX, {
      toValue: expanded ? 0 : -168,
      useNativeDriver: USE_NATIVE,
      tension: 80,
      friction: 12,
    }).start();

    Animated.timing(toggleOpacity, {
      toValue: expanded ? 0.6 : 1,
      duration: 200,
      useNativeDriver: USE_NATIVE,
    }).start();
  }, [expanded]);

  const fg = (a: number) =>
    darkMode ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  const panelBg = darkMode
    ? "rgba(12,18,28,0.92)"
    : "rgba(248,248,248,0.92)";

  const activeCount = isActive
    ? reacoes.filter((_, i) => intensity >= THRESHOLDS[i]).length
    : 0;

  const panelShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
    web: { boxShadow: "2px 0 8px rgba(0,0,0,0.08)" },
    default: {},
  });

  return (
    <View style={[styles.wrapper, { top: topOffset }]}>
      <Animated.View
        style={[
          styles.panel,
          panelShadow,
          {
            backgroundColor: panelBg,
            borderColor: fg(0.08),
            transform: [{ translateX: slideX }],
            pointerEvents: expanded ? "auto" : "none",
          },
        ]}
      >
        <Text style={[styles.panelTitle, { color: fg(0.55) }]}>
          {reacaoLabel}
        </Text>
        <View style={[styles.divider, { backgroundColor: fg(0.1) }]} />
        {reacoes.map((item, i) => (
          <ReactionRow
            key={item}
            label={item}
            active={isActive && intensity >= THRESHOLDS[i]}
            accentColor={accentColor}
            darkMode={darkMode}
          />
        ))}
      </Animated.View>

      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={styles.toggleBtn}
        hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}
      >
        <Animated.View
          style={[
            styles.toggleInner,
            {
              backgroundColor: panelBg,
              borderColor: fg(0.1),
              opacity: toggleOpacity,
            },
          ]}
        >
          {activeCount > 0 && !expanded && (
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text style={styles.badgeText}>{activeCount}</Text>
            </View>
          )}
          <Text style={[styles.toggleChevron, { color: fg(0.45) }]}>
            {expanded ? "‹" : "›"}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
    pointerEvents: "box-none",
  },
  panel: {
    width: 160,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  panelTitle: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  reactionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    overflow: "hidden",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  reactionText: {
    fontSize: 7.5,
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  toggleBtn: {
    marginLeft: -1,
  },
  toggleInner: {
    width: 22,
    height: 44,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleChevron: {
    fontSize: 14,
    fontWeight: "300",
    lineHeight: 16,
    includeFontPadding: false,
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 4,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "700",
    color: "#fff",
    includeFontPadding: false,
  },
});
