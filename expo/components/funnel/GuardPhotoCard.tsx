import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BadgeCheck, Languages, MapPin, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Badge, PressableScale, Scrim } from '@/components/ui';
import type { Guard } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { guardA11yLabel } from './GuardCard';
import { GuardPortrait } from './GuardPortrait';
import { formatDistance, guardDisplayName, hasRating, isVerified, languageName } from './format';

export interface GuardPhotoCardProps {
  guard: Guard;
  /** Receives the guard id, so the list can pass one stable handler (keeps memo effective). */
  onPress: (guardId: string) => void;
  /** Real distance in km (only when both points are real), else omit. */
  distanceKm?: number;
  /** Fixed card size (the list computes it once from the column width). */
  height?: number;
  width?: number;
  accessibilityHint?: string;
}

// Roster entry, photo first: the portrait fills the card, a scrim carries the
// name, the honest record and a glass price pill. The whole card opens the profile.
export const GuardPhotoCard = memo(function GuardPhotoCard({
  guard,
  onPress,
  distanceKm,
  height = 360,
  width,
  accessibilityHint,
}: GuardPhotoCardProps) {
  // Subscribes to language changes, so this memoised card re-renders on a switch.
  const { t } = useTranslation(['funnel', 'common']);
  const name = guardDisplayName(guard);
  const verified = isVerified(guard);
  const rated = hasRating(guard);
  const languages = guard.languages.map(languageName);
  const priced = guard.hourlyRate > 0;

  return (
    <PressableScale
      onPress={() => onPress(guard.id)}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={guardA11yLabel(guard, { distanceKm })}
      accessibilityHint={accessibilityHint ?? t('shared.openProfileHint')}
      hoverStyle={styles.hover}
      style={[styles.card, { height }]}
    >
      <GuardPortrait
        uri={guard.photos[0]}
        name={`${guard.firstName} ${guard.lastName}`}
        width={typeof width === 'number' ? width - 2 : undefined}
        height={height - 2}
        initialsSize={Math.round(height * 0.22)}
      />
      <Scrim start={0.4} strength={0.96} />

      <View style={styles.overlay}>
        <View style={styles.text}>
          {verified ? <Badge label={t('card.verified')} tone="accent" icon={BadgeCheck} style={styles.badge} /> : null}
          <AppText variant="title3" color={Colors.white} numberOfLines={1}>
            {name}
          </AppText>
          {/* Record on its own line so the count never wraps or truncates (it did
              in English and in Spanish when it shared the line with languages). */}
          <View style={styles.metaRow}>
            {rated ? (
              <>
                <Star size={13} color={Colors.accent} fill={Colors.accent} strokeWidth={ICON_STROKE} style={styles.icon} />
                <AppText variant="footnote" color={Colors.textPrimary} tabular>
                  {guard.rating.toFixed(1)}
                </AppText>
                <AppText variant="footnote" color={Colors.textSecondary} numberOfLines={1} style={styles.shrink}>
                  · {t('shared.jobs', { count: guard.completedJobs })}
                </AppText>
              </>
            ) : (
              <AppText variant="footnote" color={Colors.textSecondary} numberOfLines={1} style={styles.shrink}>
                {t('shared.newToEscolta')}
              </AppText>
            )}
          </View>
          {languages.length > 0 || typeof distanceKm === 'number' ? (
            <View style={styles.metaRow}>
              {languages.length > 0 ? (
                <>
                  <Languages size={13} color={Colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.icon} />
                  <AppText variant="footnote" color={Colors.textSecondary} numberOfLines={1} style={styles.shrink}>
                    {languages.join(' · ')}
                  </AppText>
                </>
              ) : null}
              {typeof distanceKm === 'number' ? (
                <>
                  <MapPin
                    size={13}
                    color={Colors.textSecondary}
                    strokeWidth={ICON_STROKE}
                    style={[styles.icon, languages.length > 0 ? styles.iconGap : null]}
                  />
                  <AppText variant="footnote" color={Colors.textSecondary} numberOfLines={1} style={styles.icon}>
                    {formatDistance(distanceKm)}
                  </AppText>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        {priced ? (
          <View style={styles.pricePill}>
            <AppText variant="numeric" color={Colors.white}>
              {formatMXN(guard.hourlyRate)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {t('common:units.perHour')}
            </AppText>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: Space.lg,
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    justifyContent: 'flex-end',
  },
  hover: {
    borderColor: Colors.accentLine,
  },
  overlay: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.md,
    padding: Space.lg,
    paddingTop: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs,
  },
  badge: {
    marginBottom: Space.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  shrink: {
    flexShrink: 1,
  },
  // SVG icons (and the short distance) shrink like text in a crowded web flex
  // row; keep them whole and let the languages truncate instead.
  icon: {
    flexShrink: 0,
  },
  iconGap: {
    marginLeft: Space.sm,
  },
  // Frosted pill; the scrim underneath guarantees contrast on any photo.
  pricePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.glassStrong,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
});
