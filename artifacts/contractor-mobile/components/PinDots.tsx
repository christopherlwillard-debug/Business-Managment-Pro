import React from "react";
import { StyleSheet, View } from "react-native";

interface PinDotsProps {
  length: number;
  filled: number;
  hasError?: boolean;
}

export function PinDots({ length, filled, hasError }: PinDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < filled && styles.dotFilled,
            hasError && styles.dotError,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
    marginVertical: 24,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#94A3B8",
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: "#1B3A6B",
    borderColor: "#1B3A6B",
  },
  dotError: {
    borderColor: "#EF4444",
    backgroundColor: "#EF4444",
  },
});
