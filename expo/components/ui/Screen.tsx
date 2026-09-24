import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControlProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Colors from '@/constants/colors';
import { MAX_CONTENT_WIDTH, Space } from '@/constants/design';
import { AppText } from './AppText';
import { IconButton } from './Controls';
import i18n from '@/i18n';

// Atmosfera "Midnight": dos fuentes de luz fria (arriba a la derecha y un
// eco abajo a la izquierda) sobre el azul medianoche. Da profundidad sin ruido.
export function AmbientGlow({ height = 520, intensity = 0.34 }: { height?: number; intensity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glowA" cx="85%" cy="0%" rx="80%" ry="75%" fx="85%" fy="0%">
            <Stop offset="0" stopColor="#3B6FE0" stopOpacity={intensity} />
            <Stop offset="0.5" stopColor="#1E3F8F" stopOpacity={intensity * 0.35} />
            <Stop offset="1" stopColor="#0B1630" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowB" cx="0%" cy="70%" rx="60%" ry="45%" fx="0%" fy="70%">
            <Stop offset="0" stopColor="#2A4FB0" stopOpacity={intensity * 0.35} />
            <Stop offset="1" stopColor="#0B1630" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowA)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowB)" />
      </Svg>
    </View>
  );
}

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  glow?: boolean;
  // Aplica el inset superior (false cuando la pantalla trae NavBar propia arriba)
  padTop?: boolean;
  padBottom?: boolean;
  keyboard?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  // Contenido fijo abajo (barra de accion)
  footer?: React.ReactNode;
}

// Contenedor base de pantalla: fondo, safe area, ancho maximo en web.
export function Screen({
  children,
  scroll = true,
  glow = true,
  padTop = true,
  padBottom = false,
  keyboard = false,
  refreshControl,
  contentStyle,
  style,
  footer,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const top = padTop ? insets.top + Space.lg : 0;
  const bottom = padBottom ? insets.bottom + Space.xxl : Space.xxxl;

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, { paddingTop: top, paddingBottom: bottom }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.flex, { paddingTop: top }, contentStyle]}>
      <View style={[styles.column, styles.flex]}>{children}</View>
    </View>
  );

  return (
    <View style={[styles.root, style]}>
      {glow ? <AmbientGlow /> : null}
      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {inner}
          {footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {inner}
          {footer}
        </>
      )}
    </View>
  );
}

// Barra fija inferior para la accion principal de una pantalla de detalle.
export function ActionBar({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, Space.lg) }, style]}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

export interface ScreenHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Encabezado grande de las pantallas principales (tabs): serif con presencia.
export function ScreenHeader({ title, eyebrow, subtitle, right, style }: ScreenHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerText}>
        {eyebrow ? (
          <AppText variant="overline" color={Colors.accent} style={styles.eyebrow}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="title1" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="callout" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export interface NavBarProps {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  // Sin boton de volver (pantallas raiz de un flujo)
  hideBack?: boolean;
  transparent?: boolean;
}

// Barra superior compacta para pantallas de detalle y flujos.
export function NavBar({ title, onBack, right, hideBack, transparent }: NavBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.navBar, { paddingTop: insets.top + Space.sm }, transparent ? null : styles.navBarSolid]}>
      <View style={[styles.column, styles.navRow]}>
        <View style={styles.navSide}>
          {hideBack ? null : <IconButton icon={ChevronLeft} onPress={goBack} accessibilityLabel={i18n.t('common:actions.goBack')} />}
        </View>
        <AppText variant="headline" numberOfLines={1} style={styles.navTitle} accessibilityRole="header">
          {title ?? ''}
        </AppText>
        <View style={[styles.navSide, styles.navSideRight]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Space.gutter,
  },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.lg,
    marginBottom: Space.xxl,
  },
  headerText: {
    flex: 1,
  },
  headerRight: {
    paddingBottom: Space.xs,
  },
  eyebrow: {
    marginBottom: Space.sm,
  },
  subtitle: {
    marginTop: Space.sm,
    maxWidth: 420,
  },
  navBar: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
    zIndex: 10,
  },
  navBarSolid: {
    backgroundColor: 'rgba(5, 8, 15, 0.94)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.glassBorder,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navSide: {
    width: 88,
    flexDirection: 'row',
  },
  navSideRight: {
    justifyContent: 'flex-end',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
  },
  actionBar: {
    paddingTop: Space.md,
    paddingHorizontal: Space.gutter,
    backgroundColor: 'rgba(5, 8, 15, 0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.glassBorder,
  },
});
