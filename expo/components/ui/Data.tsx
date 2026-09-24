import React, { useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BadgeCheck, ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Fonts, ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

const initialsOf = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '·';

export interface AvatarProps {
  name?: string;
  uri?: string | null;
  size?: number;
  verified?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Cuadrado redondeado (no circulo). Iniciales en la tipografia de titulares si no hay foto o falla.
export function Avatar({ name, uri, size = 48, verified, style }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.3);
  const showImage = !!uri && typeof uri === 'string' && uri.trim() !== '' && !failed;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: radius }]}>
        {showImage ? (
          <Image
            source={{ uri: uri as string }}
            style={{ width: size, height: size }}
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <AppText style={{ fontFamily: Fonts.display, fontSize: size * 0.34, lineHeight: size * 0.42, letterSpacing: 0.5, color: Colors.accentLight }}>
            {initialsOf(name)}
          </AppText>
        )}
      </View>
      {verified ? (
        <View style={[styles.verified, { right: -3, bottom: -3 }]}>
          <BadgeCheck size={Math.max(14, size * 0.3)} color={Colors.accent} fill={Colors.background} strokeWidth={2} />
        </View>
      ) : null}
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  accessibilityHint?: string;
}

// Fila de ajustes / navegacion. Agrupar dentro de <ListGroup>.
export function ListRow({ title, subtitle, icon: Icon, value, onPress, destructive, trailing, showChevron = !!onPress, accessibilityHint }: ListRowProps) {
  const fg = destructive ? Colors.error : Colors.textPrimary;
  const content = (
    <>
      {Icon ? (
        <View style={[styles.rowIcon, destructive ? styles.rowIconDanger : null]}>
          <Icon size={17} color={destructive ? Colors.error : Colors.accent} strokeWidth={ICON_STROKE} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <AppText variant="bodyMedium" color={fg} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" numberOfLines={3}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="callout" numberOfLines={1} style={styles.rowValue}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {showChevron ? <ChevronRight size={17} color={Colors.textTertiary} strokeWidth={ICON_STROKE} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      hoverStyle={{ backgroundColor: Colors.surfaceLight }}
      style={styles.row}
    >
      {content}
    </PressableScale>
  );
}

export function ListGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {child}
          {i < items.length - 1 ? <View style={styles.groupDivider} /> : null}
        </View>
      ))}
    </View>
  );
}

export interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}

// adjustsFontSizeToFit solo existe en iOS/Android; en web una cifra larga
// ("$16,438.50") se cortaba con puntos suspensivos. Se ajusta por longitud.
const valueSize = (value: string | number) => {
  const len = String(value).length;
  // Solo baja la letra: el alto de linea se queda en 31 para que las pistas
  // de debajo sigan alineadas entre fichas de la misma fila.
  if (len > 11) return { fontSize: 17 };
  if (len > 8) return { fontSize: 20 };
  return null;
};

export function StatTile({ label, value, hint, icon: Icon, accent, style }: StatTileProps) {
  return (
    <View style={[styles.stat, style]}>
      <View style={styles.statHead}>
        <AppText variant="overline" numberOfLines={2} style={styles.statLabel}>
          {label}
        </AppText>
        {Icon ? <Icon size={15} color={accent ? Colors.accent : Colors.textTertiary} strokeWidth={ICON_STROKE} /> : null}
      </View>
      <AppText
        variant="numericLarge"
        color={accent ? Colors.accentLight : Colors.textPrimary}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={valueSize(value)}
      >
        {value}
      </AppText>
      {hint ? (
        <AppText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

// Par etiqueta/valor alineado a los extremos (resumen de reserva, recibos).
export function InfoRow({ label, value, icon: Icon, emphasis, style }: { label: string; value: React.ReactNode; icon?: LucideIcon; emphasis?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.info, style]}>
      <View style={styles.infoLabel}>
        {Icon ? <Icon size={16} color={Colors.textTertiary} strokeWidth={ICON_STROKE} /> : null}
        <AppText variant={emphasis ? 'bodyMedium' : 'callout'} color={emphasis ? Colors.textPrimary : Colors.textSecondary}>
          {label}
        </AppText>
      </View>
      {typeof value === 'string' || typeof value === 'number' ? (
        <AppText variant={emphasis ? 'headline' : 'bodyMedium'} tabular numberOfLines={2} style={styles.infoValue} color={emphasis ? Colors.accentLight : Colors.textPrimary}>
          {value}
        </AppText>
      ) : (
        value
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  verified: {
    position: 'absolute',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 60,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: {
    backgroundColor: Colors.errorSoft,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // El valor cede ante el titulo; en espanol los titulos son mas largos.
  rowValue: {
    maxWidth: '50%',
    flexShrink: 1,
    textAlign: 'right',
  },
  group: {
    backgroundColor: Colors.glass,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
  },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.glassBorder,
    marginLeft: Space.lg + 34 + Space.md,
  },
  stat: {
    flex: 1,
    minWidth: 140,
    padding: Space.lg,
    gap: Space.sm,
    backgroundColor: Colors.glass,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  statHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  // Siempre dos lineas de alto: si una etiqueta se parte (pasa mucho en
  // espanol), las cifras de la fila siguen alineadas.
  statLabel: {
    flexShrink: 1,
    minHeight: 28,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.lg,
    paddingVertical: Space.sm + 2,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flexShrink: 0,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
