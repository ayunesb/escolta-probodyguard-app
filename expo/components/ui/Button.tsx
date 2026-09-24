import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Shadow, Space, Type } from '@/constants/design';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 38, md: 50, lg: 56 };
const ICON: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 19 };

const TONE: Record<ButtonVariant, { bg: string; fg: string; border: string; hover: string }> = {
  primary: { bg: Colors.gold, fg: Colors.textOnGold, border: Colors.gold, hover: Colors.goldLight },
  secondary: { bg: Colors.surfaceLight, fg: Colors.textPrimary, border: Colors.borderStrong, hover: Colors.elevated },
  outline: { bg: 'transparent', fg: Colors.gold, border: Colors.goldLine, hover: Colors.goldSoft },
  ghost: { bg: 'transparent', fg: Colors.gold, border: 'transparent', hover: Colors.goldSoft },
  danger: { bg: Colors.errorSoft, fg: Colors.error, border: 'rgba(224, 86, 79, 0.28)', hover: 'rgba(224, 86, 79, 0.2)' },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const tone = TONE[variant];
  const inactive = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      haptic={variant === 'primary' ? 'light' : false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      hoverStyle={{ backgroundColor: tone.hover }}
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? Space.md : Space.xl,
          backgroundColor: tone.bg,
          borderColor: tone.border,
          borderRadius: size === 'sm' ? Radius.sm : Radius.md,
        },
        fullWidth ? styles.fullWidth : styles.inline,
        variant === 'primary' && !inactive ? Shadow.gold : null,
        inactive ? styles.inactive : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} size="small" />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={ICON[size]} color={tone.fg} strokeWidth={ICON_STROKE + 0.25} /> : null}
          <AppText
            numberOfLines={1}
            style={[Type.button, { color: tone.fg }, size === 'sm' ? styles.smallText : null]}
          >
            {title}
          </AppText>
          {IconRight ? <IconRight size={ICON[size]} color={tone.fg} strokeWidth={ICON_STROKE + 0.25} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  inline: {
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  smallText: {
    fontSize: 13.5,
  },
  inactive: {
    opacity: 0.5,
  },
});
