import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export interface BackgroundVideoProps {
  source: number;
  poster: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
}

// iOS/Android: expo-video en bucle, mudo, sin controles. El poster queda
// debajo mientras carga y reemplaza al video si el usuario pidio reducir
// movimiento.
export function BackgroundVideo({ source, poster, style }: BackgroundVideoProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) player.pause();
    else player.play();
  }, [reduceMotion, player]);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image source={poster} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" />
      {reduceMotion ? null : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
      )}
    </View>
  );
}
