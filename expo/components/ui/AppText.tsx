import React from 'react';
import { Text, TextProps, TextStyle, StyleProp } from 'react-native';
import { Type, TypeVariant, Fonts, FontWeightName } from '@/constants/design';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  // Cambia solo el peso sin salir de la variante (no aplica a las serif)
  weight?: FontWeightName;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
  style?: StyleProp<TextStyle>;
}

export function AppText({
  variant = 'body',
  color,
  weight,
  align,
  tabular,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        Type[variant],
        weight ? { fontFamily: Fonts[weight] } : null,
        color ? { color } : null,
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
