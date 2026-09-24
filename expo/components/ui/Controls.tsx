import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface IconButtonProps {
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  tone?: 'default' | 'gold' | 'danger';
  // Punto de aviso (notificaciones sin leer, etc.)
  dot?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  size = 40,
  tone = 'default',
  dot,
  disabled,
  style,
}: IconButtonProps) {
  const fg = tone === 'gold' ? Colors.gold : tone === 'danger' ? Colors.error : Colors.textPrimary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.92}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hoverStyle={{ backgroundColor: Colors.surfaceLight }}
      hitSlop={6}
      style={[
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Icon size={Math.round(size * 0.45)} color={fg} strokeWidth={ICON_STROKE} />
      {dot ? <View style={styles.dot} /> : null}
    </PressableScale>
  );
}

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  count?: number;
  style?: StyleProp<ViewStyle>;
}

// Filtro seleccionable.
export function Chip({ label, selected, onPress, icon: Icon, count, style }: ChipProps) {
  const fg = selected ? Colors.goldLight : Colors.textSecondary;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      hoverStyle={selected ? undefined : { borderColor: Colors.borderStrong }}
      style={[styles.chip, selected ? styles.chipSelected : null, style]}
    >
      {Icon ? <Icon size={15} color={fg} strokeWidth={ICON_STROKE} /> : null}
      <AppText variant="caption" color={fg} style={styles.chipText}>
        {label}
      </AppText>
      {typeof count === 'number' ? (
        <AppText variant="caption" color={selected ? Colors.gold : Colors.textTertiary} tabular>
          {count}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label?: string; icon?: LucideIcon; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => onChange(opt.value)}
            scaleTo={0.95}
            haptic="selection"
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.accessibilityLabel ?? opt.label}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            {Icon ? (
              <Icon size={16} color={active ? Colors.textPrimary : Colors.textTertiary} strokeWidth={ICON_STROKE} />
            ) : null}
            {opt.label ? (
              <AppText variant="caption" color={active ? Colors.textPrimary : Colors.textTertiary}>
                {opt.label}
              </AppText>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.gold,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  disabled: {
    opacity: 0.45,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.goldSoft,
    borderColor: Colors.goldLine,
  },
  chipText: {
    fontSize: 13,
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: Radius.sm + 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 38,
    height: 32,
    paddingHorizontal: Space.md,
    borderRadius: Radius.sm - 2,
  },
  segmentActive: {
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
});
