import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Colors from '@/constants/colors';
import { Fonts, Space } from '@/constants/design';
import { AppText } from './AppText';

// Emblema: escudo de trazo fino con un segundo escudo interior y una
// cerradura. Vectorial, asi que se ve nitido en cualquier densidad.
export function BrandMark({ size = 56, color = Colors.gold }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none" accessibilityLabel="Escolta Pro">
      <Path
        d="M32 4.5 L54 12.5 V30.5 C54 44.5 44.6 54.6 32 59.5 C19.4 54.6 10 44.5 10 30.5 V12.5 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M32 11 L48 16.8 V30.6 C48 41 41.3 48.6 32 52.6 C22.7 48.6 16 41 16 30.6 V16.8 Z"
        stroke={color}
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <Path
        d="M32 23.5 a4.6 4.6 0 0 1 2.4 8.5 L35.6 39.5 H28.4 L29.6 32 A4.6 4.6 0 0 1 32 23.5 Z"
        fill={color}
      />
    </Svg>
  );
}

// Logotipo completo: emblema + ESCOLTA PRO en expandida negra, con tracking
// de placa, + descriptor en versalitas doradas.
export function Wordmark({ size = 'md', style }: { size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle> }) {
  const scale = size === 'lg' ? 1.25 : size === 'sm' ? 0.75 : 1;
  return (
    <View style={[styles.row, style]}>
      <BrandMark size={34 * scale} />
      <View>
        <AppText style={{ fontFamily: Fonts.displayHeavy, fontSize: 18 * scale, lineHeight: 21 * scale, letterSpacing: 3.2 * scale, color: Colors.textPrimary }}>
          ESCOLTA PRO
        </AppText>
        <AppText variant="overline" color={Colors.gold} style={{ fontSize: 8.5 * scale, letterSpacing: 2.6 * scale, marginTop: 3 }}>
          Executive protection
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
});
