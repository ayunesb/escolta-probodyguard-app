import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, IconButton } from '@/components/ui';

export interface StepperRowProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  // How the value reads, e.g. (n) => `${n} h`
  format?: (value: number) => string;
  // Singular noun for screen readers ("protector", "hour"). English only:
  // prefer `formatSpoken`, which can pluralise in any language.
  unit?: string;
  // What a screen reader says for the value, e.g. (n) => t('hours', { count: n })
  formatSpoken?: (value: number) => string;
}

// Label on the left, − value + on the right. Limits come from the caller
// (PRICING for anything that affects the price) and the buttons disable at
// the bounds, so an out-of-range value can never be produced.
export function StepperRow({ label, hint, value, min, max, onChange, format, unit, formatSpoken }: StepperRowProps) {
  const { t } = useTranslation('funnel');
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const shown = format ? format(value) : String(value);
  const spoken = formatSpoken ? formatSpoken(value) : unit ? `${value} ${unit}${value === 1 ? '' : 's'}` : shown;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: spoken }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(clamp(value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(clamp(value - 1));
      }}
    >
      <View style={styles.text}>
        <AppText variant="bodyMedium">{label}</AppText>
        {hint ? (
          <AppText variant="footnote" color={Colors.textTertiary}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <View style={styles.controls}>
        <IconButton
          icon={Minus}
          size={36}
          onPress={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          accessibilityLabel={t('stepper.decrease', { label: label.toLowerCase() })}
        />
        <AppText variant="numeric" align="center" style={styles.value}>
          {shown}
        </AppText>
        <IconButton
          icon={Plus}
          size={36}
          onPress={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          accessibilityLabel={t('stepper.increase', { label: label.toLowerCase() })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 64,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  value: {
    minWidth: 44,
    fontSize: 17,
  },
});
