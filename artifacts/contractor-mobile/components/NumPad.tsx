import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

interface NumPadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
  onDecimal?: () => void;
  showDecimal?: boolean;
}

const BUTTONS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

export function NumPad({ onPress, onDelete, onDecimal, showDecimal = true }: NumPadProps) {
  function handlePress(key: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === "⌫") {
      onDelete();
    } else if (key === ".") {
      onDecimal?.();
    } else {
      onPress(key);
    }
  }

  return (
    <View style={styles.grid}>
      {BUTTONS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key) => {
            const isDecimal = key === ".";
            const isDelete = key === "⌫";
            const hidden = isDecimal && !showDecimal;
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [
                  styles.key,
                  (isDecimal || isDelete) && styles.keyMuted,
                  pressed && styles.keyPressed,
                  hidden && styles.keyHidden,
                ]}
                onPress={() => !hidden && handlePress(key)}
                accessibilityLabel={isDelete ? "delete" : key}
              >
                <Text style={[styles.keyText, (isDecimal || isDelete) && styles.keyTextMuted]}>
                  {key}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 8,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  key: {
    flex: 1,
    height: 68,
    borderRadius: 16,
    backgroundColor: "#F0F4F8",
    alignItems: "center",
    justifyContent: "center",
  },
  keyMuted: {
    backgroundColor: "#E8EEF4",
  },
  keyHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  keyPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.96 }],
  },
  keyText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1B3A6B",
    fontFamily: "Inter_600SemiBold",
  },
  keyTextMuted: {
    color: "#64748B",
  },
});
