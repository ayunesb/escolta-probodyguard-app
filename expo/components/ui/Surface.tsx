import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import type { BookingStatus } from '@/types';
import { AppText } from './AppText';
import { Button } from './Button';
import { PressableScale } from './PressableScale';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  // 'raised' para lo que debe destacar (resumen de pago, trabajo nuevo)
  tone?: 'default' | 'raised' | 'gold';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Card({ children, onPress, padded = true, tone = 'default', style, accessibilityLabel, accessibilityHint }: CardProps) {
  const cardStyle = [
    styles.card,
    tone === 'raised' ? styles.cardRaised : null,
    tone === 'gold' ? styles.cardGold : null,
    padded ? styles.padded : null,
    style,
  ];
  if (!onPress) {
    return <View style={cardStyle}>{children}</View>;
  }
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hoverStyle={{ borderColor: tone === 'gold' ? Colors.gold : Colors.borderStrong }}
      style={cardStyle}
    >
      {children}
    </PressableScale>
  );
}

export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

// Titulo de seccion dentro de una pantalla.
export function SectionTitle({ title, action, style }: { title: string; action?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <AppText variant="overline">{title}</AppText>
      {action}
    </View>
  );
}

export type Tone = 'neutral' | 'gold' | 'success' | 'warning' | 'error' | 'info';

const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: Colors.textSecondary, bg: Colors.surfaceLight },
  gold: { fg: Colors.goldLight, bg: Colors.goldSoft },
  success: { fg: Colors.success, bg: Colors.successSoft },
  warning: { fg: Colors.warning, bg: Colors.warningSoft },
  error: { fg: Colors.error, bg: Colors.errorSoft },
  info: { fg: Colors.info, bg: Colors.infoSoft },
};

export function Badge({ label, tone = 'neutral', icon: Icon, style }: { label: string; tone?: Tone; icon?: LucideIcon; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {Icon ? <Icon size={12} color={t.fg} strokeWidth={2} /> : null}
      <AppText variant="caption" color={t.fg} style={styles.badgeText}>
        {label}
      </AppText>
    </View>
  );
}

const STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'gold' },
  rejected: { label: 'Declined', tone: 'error' },
  en_route: { label: 'En route', tone: 'info' },
  active: { label: 'In progress', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'error' },
};

export const bookingStatusMeta = (status?: string): { label: string; tone: Tone } =>
  STATUS[status as BookingStatus] ?? { label: status ? status.replace(/_/g, ' ') : 'Unknown', tone: 'neutral' };

export function StatusBadge({ status, style }: { status?: string; style?: StyleProp<ViewStyle> }) {
  const meta = bookingStatusMeta(status);
  return <Badge label={meta.label} tone={meta.tone} style={style} />;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyRing}>
        <View style={styles.emptyInner}>
          <Icon size={26} color={Colors.gold} strokeWidth={1.5} />
        </View>
      </View>
      <AppText variant="title3" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="callout" align="center" style={styles.emptyMessage}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="outline" fullWidth={false} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

const useNative = Platform.OS !== 'web';

// Bloque de carga con pulso suave. Componer con la forma real del contenido.
export function Skeleton({ width = '100%', height = 16, radius = Radius.xs, style }: { width?: ViewStyle['width']; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 750, useNativeDriver: useNative }),
        Animated.timing(opacity, { toValue: 0.45, duration: 750, useNativeDriver: useNative }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: Colors.surfaceLight, opacity }, style]} />;
}

// Tarjeta esqueleto generica para listas.
export function SkeletonCard({ lines = 2, media = false }: { lines?: number; media?: boolean }) {
  return (
    <View style={[styles.card, styles.padded, styles.skeletonCard]}>
      <View style={styles.skeletonRow}>
        {media ? <Skeleton width={48} height={48} radius={Radius.sm} /> : null}
        <View style={styles.skeletonLines}>
          <Skeleton width="55%" height={14} />
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} width={i === lines - 1 ? '35%' : '85%'} height={11} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardRaised: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.borderStrong,
  },
  cardGold: {
    borderColor: Colors.goldLine,
  },
  padded: {
    padding: Space.lg,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderStrong,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.xxl,
    marginBottom: Space.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  badgeText: {
    fontSize: 11.5,
    letterSpacing: 0.2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Space.huge,
    paddingHorizontal: Space.xxl,
  },
  emptyRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: Colors.goldLine,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xl,
  },
  emptyInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMessage: {
    marginTop: Space.sm,
    maxWidth: 300,
  },
  emptyAction: {
    marginTop: Space.xl,
    alignSelf: 'center',
  },
  skeletonCard: {
    marginBottom: Space.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  skeletonLines: {
    flex: 1,
    gap: Space.sm,
  },
});
