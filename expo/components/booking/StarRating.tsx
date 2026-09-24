import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
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

// Area tactil minima de cada estrella editable. En web hitSlop no existe, asi
// que la celda misma mide 44 px y el espacio entre estrellas sale de ella.
const MIN_TARGET = 44;

export function StarRating({ value, onChange, size = 28, label, style }: StarRatingProps) {
  const { t } = useTranslation('booking');
  const gap = size > 24 ? Space.sm : Space.xs;
  const cell = Math.max(MIN_TARGET, size + gap);
  return (
    <View
      style={[styles.row, onChange ? null : { gap }, style]}
      accessibilityRole={onChange ? 'radiogroup' : 'image'}
      accessibilityLabel={
        onChange ? label : label ? t('stars.readOnlyLabeled', { label, value }) : t('stars.readOnly', { value })
      }
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const icon = (
          <Star
            size={size}
            color={filled ? Colors.accent : Colors.textTertiary}
            fill={filled ? Colors.accent : 'transparent'}
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
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={label ? t('stars.starLabeled', { label, count: n }) : t('stars.star', { count: n })}
            style={[styles.cell, { width: cell, height: cell }]}
          >
            {icon}
          </PressableScale>
        );
      })}
    </View>
  );
}

// Margen que deja la celda a cada lado de la estrella: sirve para alinear la
// primera estrella con el texto de arriba (marginLeft negativo).
export const starCellInset = (size: number): number => {
  const gap = size > 24 ? Space.sm : Space.xs;
  return (Math.max(MIN_TARGET, size + gap) - size) / 2;
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
