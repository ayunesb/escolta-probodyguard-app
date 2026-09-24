import React, { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Motion } from '@/constants/design';

const useNative = Platform.OS !== 'web';

// Un solo nodo: el Pressable mismo se anima. Antes el estilo iba a una vista
// interna y el Pressable externo era el que el padre acomodaba, asi que flex,
// flexBasis o width del llamador no tenian efecto (rejillas y botones en fila
// salian desalineados).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  // Estilo extra mientras el puntero esta encima (solo web)
  hoverStyle?: StyleProp<ViewStyle>;
  // Cuanto se encoge al presionar. 0.97 para botones, 0.985 para tarjetas.
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'selection' | false;
  children?: React.ReactNode;
}

// Retroalimentacion fisica en todo lo que se toca: se hunde con un muelle
// firme y vuelve. Solo transform/opacity, nunca layout, para que no cueste.
export function PressableScale({
  style,
  hoverStyle,
  scaleTo = 0.97,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: useNative,
      ...Motion.spring,
    }).start();
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onHoverIn={hoverStyle ? () => setHovered(true) : undefined}
      onHoverOut={hoverStyle ? () => setHovered(false) : undefined}
      onPressIn={(e) => {
        animateTo(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic && Platform.OS !== 'web') {
          if (haptic === 'selection') {
            Haptics.selectionAsync().catch(() => {});
          } else {
            Haptics.impactAsync(
              haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
            ).catch(() => {});
          }
        }
        onPress?.(e);
      }}
      style={[style, hovered && !disabled ? hoverStyle : null, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
