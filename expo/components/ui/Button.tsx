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

const HEIGHT: Record<ButtonSize, number> = { sm: 38, md: 52, lg: 58 };
const ICON: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 19 };

// Principal: pastilla blanca con texto medianoche (la accion mas importante
// de la pantalla, una sola). Secundario: vidrio esmerilado. Contorno y
// fantasma en azul hielo.
const TONE: Record<ButtonVariant, { bg: string; fg: string; border: string; hover: string }> = {
  primary: { bg: Colors.textPrimary, fg: Colors.textOnAccent, border: Colors.textPrimary, hover: Colors.white },
  secondary: { bg: Colors.glassStrong, fg: Colors.textPrimary, border: Colors.glassBorder, hover: 'rgba(160, 188, 255, 0.16)' },
  outline: { bg: 'transparent', fg: Colors.accentLight, border: Colors.accentLine, hover: Colors.accentSoft },
  ghost: { bg: 'transparent', fg: Colors.accentLight, border: 'transparent', hover: Colors.accentSoft },
  danger: { bg: Colors.errorSoft, fg: Colors.error, border: 'rgba(255, 107, 107, 0.3)', hover: 'rgba(255, 107, 107, 0.2)' },
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
          paddingHorizontal: size === 'sm' ? Space.lg : Space.xxl,
          backgroundColor: tone.bg,
          borderColor: tone.border,
        },
        fullWidth ? styles.fullWidth : styles.inline,
        variant === 'primary' && !inactive ? Shadow.accent : null,
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
    borderRadius: Radius.pill,
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
    opacity: 0.45,
  },
});
