import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/design';
import { AppText } from '@/components/ui';

let portraitSeq = 0;
const PORTRAIT_RATIO = 3 / 4;

const initialsOf = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '·';

export interface GuardPortraitProps {
  uri?: string | null;
  // Full name, for the initials fallback.
  name?: string;
  // Size of the fallback initials.
  initialsSize?: number;
  // Frame size in points. When given, the image gets explicit numeric
  // dimensions (most robust on web); otherwise it sizes itself by ratio.
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

// Fills its parent with the guard's portrait. Portraits are 3:4 with the face
// in the upper third, so the image is laid out 3:4 from the TOP edge (never
// centre-cropped): wide frames keep the head in view instead of cutting it.
// No photo, or a URL that fails to load: midnight gradient + large initials in
// the display face. Never a broken image.
export function GuardPortrait({ uri, name, initialsSize = 72, width, height, style }: GuardPortraitProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const showImage = typeof uri === 'string' && uri.trim() !== '' && !failed;
  // 3:4 box anchored at the top, never shorter than the frame.
  const imageSize =
    typeof width === 'number' && typeof height === 'number'
      ? { width, height: Math.max(height, Math.round(width / PORTRAIT_RATIO)) }
      : styles.imageByRatio;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frame, style]}>
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={[styles.image, imageSize]}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <PortraitFallback name={name} size={initialsSize} />
      )}
    </View>
  );
}

function PortraitFallback({ name, size }: { name?: string; size: number }) {
  const id = useRef(`portrait-${++portraitSeq}`).current;
  return (
    <>
      <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`${id}-base`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.elevated} stopOpacity={1} />
            <Stop offset="0.6" stopColor={Colors.surface} stopOpacity={1} />
            <Stop offset="1" stopColor={Colors.background} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id={`${id}-glow`} cx="70%" cy="10%" rx="75%" ry="60%" fx="70%" fy="10%">
            <Stop offset="0" stopColor={Colors.accent} stopOpacity={0.28} />
            <Stop offset="1" stopColor={Colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-base)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-glow)`} />
      </Svg>
      {/* Initials sit in the upper part: the bottom carries the name overlay. */}
      <View style={styles.initialsBox}>
        <AppText
          style={{
            fontFamily: Fonts.displayHeavy,
            fontSize: size,
            lineHeight: Math.round(size * 1.15),
            letterSpacing: size * 0.04,
            color: Colors.accentLight,
          }}
        >
          {initialsOf(name)}
        </AppText>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  imageByRatio: {
    width: '100%',
    aspectRatio: PORTRAIT_RATIO,
    minHeight: '100%',
  },
  initialsBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '38%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
