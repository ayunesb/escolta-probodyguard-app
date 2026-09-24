import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Star } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { PressableScale } from '@/components/ui';

interface StarRatingProps {
  value: number;
  // Sin onChange es solo lectura.
  onChange?: (value: number) => void;
  size?: number;
  label?: string; // para lectores de pantalla: "Overall"
  style?: StyleProp<ViewStyle>;
}

export function StarRating({ value, onChange, size = 28, label, style }: StarRatingProps) {
  return (
    <View
      style={[styles.row, { gap: size > 24 ? Space.sm : Space.xs }, style]}
      accessibilityRole={onChange ? 'radiogroup' : 'image'}
      accessibilityLabel={onChange ? label : `${label ? `${label}: ` : ''}${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const icon = (
          <Star
            size={size}
            color={filled ? Colors.gold : Colors.textTertiary}
            fill={filled ? Colors.gold : 'transparent'}
            strokeWidth={1.5}
          />
        );
        if (!onChange) return <View key={n}>{icon}</View>;
        return (
          <PressableScale
            key={n}
            onPress={() => onChange(n)}
            scaleTo={0.88}
            haptic="selection"
            hitSlop={4}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={`${label ? `${label}, ` : ''}${n} ${n === 1 ? 'star' : 'stars'}`}
          >
            {icon}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
