import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Asset } from 'expo-asset';

export interface BackgroundVideoProps {
  source: number;
  poster: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
}

// Web: <video> nativo del navegador, mudo, en bucle y en linea (iOS Safari
// exige muted + playsInline para reproducir solo). Con "reducir movimiento"
// activado se queda el cuadro fijo.
export function BackgroundVideo({ source, poster, style }: BackgroundVideoProps) {
  const uri = useMemo(() => Asset.fromModule(source).uri, [source]);
  const posterUri = useMemo(() => {
    const resolved = Image.resolveAssetSource?.(poster as number);
    return resolved?.uri ?? (typeof poster === 'object' && poster && 'uri' in poster ? (poster as { uri?: string }).uri : undefined);
  }, [poster]);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image source={poster} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" />
      {reduceMotion
        ? null
        : React.createElement('video', {
            src: uri,
            poster: posterUri,
            autoPlay: true,
            muted: true,
            loop: true,
            playsInline: true,
            preload: 'auto',
            'aria-hidden': true,
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
          })}
    </View>
  );
}
