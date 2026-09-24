import React, { useEffect, useRef } from 'react';
import { Animated, Image, ImageSourcePropType, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import { BrandImages } from '@/constants/brandMedia';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

let scrimSeq = 0;

// Foto a sangre dentro de su contenedor. OJO: en web, <Image> con
// StyleSheet.absoluteFill toma el tamano intrinseco del archivo (p. ej.
// 1440x814) y se ve ampliadisima; con ancho/alto al 100% llena el padre.
export const fillImage = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' } as const;

// Degradado para que el texto se lea sobre una foto. `from` es el borde
// transparente; el color va hacia el lado opuesto.
export function Scrim({
  from = 'top',
  color = Colors.background,
  strength = 0.92,
  start = 0.2,
  style,
}: {
  from?: 'top' | 'bottom';
  color?: string;
  strength?: number;
  start?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = useRef(`scrim-${++scrimSeq}`).current;
  const topDown = from === 'top';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1={topDown ? '0' : '1'} x2="0" y2={topDown ? '1' : '0'}>
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset={String(start)} stopColor={color} stopOpacity={0} />
            {/* El tramo medio siempre despues de `start`: con paradas fuera de
                orden el SVG pintaba un corte duro en vez de un degradado. */}
            <Stop offset={String(start + (1 - start) * 0.6)} stopColor={color} stopOpacity={strength * 0.72} />
            <Stop offset="1" stopColor={color} stopOpacity={strength} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export interface PhotoCardProps {
  image: ImageSourcePropType;
  title?: string;
  caption?: string;
  eyebrow?: string;
  height?: number;
  width?: number | `${number}%`;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

// Foto con esquinas grandes, degradado y texto encima.
export function PhotoCard({ image, title, caption, eyebrow, height = 220, width, onPress, accessibilityLabel, style, children }: PhotoCardProps) {
  const body = (
    <>
      <Image source={image} style={fillImage} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Scrim start={0.38} strength={0.86} />
      <View style={styles.photoBody}>
        {eyebrow ? (
          <AppText variant="overline" color={Colors.accentLight}>
            {eyebrow}
          </AppText>
        ) : null}
        {title ? (
          <AppText variant="headline" color={Colors.white} numberOfLines={2}>
            {title}
          </AppText>
        ) : null}
        {caption ? (
          <AppText variant="footnote" color={Colors.textSecondary} numberOfLines={2}>
            {caption}
          </AppText>
        ) : null}
        {children}
      </View>
    </>
  );
  const frame = [styles.photo, { height }, width !== undefined ? { width } : null, style];
  if (!onPress) {
    return (
      <View style={frame} accessible accessibilityLabel={accessibilityLabel ?? title}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} style={frame}>
      {body}
    </PressableScale>
  );
}

const useNative = Platform.OS !== 'web';

// Escudo de vidrio 3D con un resplandor que respira lento.
export function GlassShield({ size = 140, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2200, useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, useNativeDriver: useNative }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.6] });
  const lift = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const w = size;
  const h = size * (626 / 540);
  return (
    <View style={[{ width: w * 1.5, height: h * 1.25, alignItems: 'center', justifyContent: 'center' }, style]} pointerEvents="none">
      <Animated.View
        style={[
          styles.shieldGlow,
          { width: w * 1.2, height: w * 1.2, borderRadius: w * 0.6, opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />
      <Animated.Image
        source={BrandImages.shield}
        style={{ width: w, height: h, transform: [{ translateY: lift }] }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    justifyContent: 'flex-end',
  },
  photoBody: {
    padding: Space.lg,
    gap: 3,
  },
  shieldGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(110, 160, 255, 0.35)',
    ...Platform.select({
      web: { filter: 'blur(40px)' } as object,
      default: { shadowColor: '#6EA0FF', shadowOpacity: 0.9, shadowRadius: 50, shadowOffset: { width: 0, height: 0 } },
    }),
  },
});
