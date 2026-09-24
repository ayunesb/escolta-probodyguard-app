import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Award, Languages, MapPin, Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Avatar, Badge, Card } from '@/components/ui';
import type { Guard } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { formatDistance, guardDisplayName, hasRating, isVerified, languageName } from './format';

/** Screen-reader summary of a protector, shared by the row and photo cards. */
export function guardA11yLabel(guard: Guard, opts: { distanceKm?: number; showRate?: boolean } = {}): string {
  const { distanceKm, showRate = true } = opts;
  return [
    guardDisplayName(guard),
    isVerified(guard) ? i18n.t('funnel:card.a11yVerified') : null,
    hasRating(guard)
      ? i18n.t('funnel:card.a11yRated', { rating: guard.rating.toFixed(1), count: guard.completedJobs })
      : i18n.t('funnel:card.a11yNew'),
    showRate && guard.hourlyRate > 0 ? i18n.t('funnel:shared.rateA11y', { rate: formatMXN(guard.hourlyRate) }) : null,
    typeof distanceKm === 'number' ? formatDistance(distanceKm) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export interface GuardCardProps {
  guard: Guard;
  onPress: () => void;
  /** Real distance in km (only when both points are real), else omit. */
  distanceKm?: number;
  /** Hide the hourly rate (e.g. reassignment, where the paid price is fixed). */
  showRate?: boolean;
  accessibilityHint?: string;
}

// One protector as a compact glass row: portrait, name, honest record,
// languages, and the hourly rate as the only ice-blue figure on the card.
export function GuardCard({ guard, onPress, distanceKm, showRate = true, accessibilityHint }: GuardCardProps) {
  const { t } = useTranslation('funnel');
  const name = guardDisplayName(guard);
  const rated = hasRating(guard);
  const languages = guard.languages.map(languageName);
  const certs = guard.certifications;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={guardA11yLabel(guard, { distanceKm, showRate })}
      accessibilityHint={accessibilityHint ?? t('shared.openProfileHint')}
      style={styles.card}
    >
      <View style={styles.row}>
        <Avatar name={`${guard.firstName} ${guard.lastName}`} uri={guard.photos[0]} size={68} verified={isVerified(guard)} />

        <View style={styles.body}>
          <AppText variant="title3" numberOfLines={1}>
            {name}
          </AppText>

          <View style={styles.metaRow}>
            {rated ? (
              <>
                <Star size={13} color={Colors.accent} fill={Colors.accent} strokeWidth={ICON_STROKE} style={styles.icon} />
                <AppText variant="footnote" color={Colors.textPrimary} tabular>
                  {guard.rating.toFixed(1)}
                </AppText>
                <AppText variant="footnote" color={Colors.textTertiary} numberOfLines={1} style={styles.shrink}>
                  · {t('shared.jobs', { count: guard.completedJobs })}
                </AppText>
              </>
            ) : (
              <Badge label={t('shared.newToEscolta')} tone="neutral" />
            )}
          </View>

          {languages.length > 0 || typeof distanceKm === 'number' ? (
            <View style={styles.metaRow}>
              {languages.length > 0 ? (
                <>
                  <Languages size={13} color={Colors.textTertiary} strokeWidth={ICON_STROKE} style={styles.icon} />
                  <AppText variant="caption" numberOfLines={1} style={styles.shrink}>
                    {languages.join(' · ')}
                  </AppText>
                </>
              ) : null}
              {typeof distanceKm === 'number' ? (
                <>
                  <MapPin
                    size={13}
                    color={Colors.textTertiary}
                    strokeWidth={ICON_STROKE}
                    style={[styles.icon, languages.length > 0 ? styles.iconGap : null]}
                  />
                  <AppText variant="caption" numberOfLines={1} style={styles.icon}>
                    {formatDistance(distanceKm)}
                  </AppText>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        {showRate && guard.hourlyRate > 0 ? (
          <View style={styles.rate}>
            <AppText variant="numeric" color={Colors.accentLight}>
              {formatMXN(guard.hourlyRate)}
            </AppText>
            <AppText variant="caption" color={Colors.textTertiary}>
              {t('shared.perHour')}
            </AppText>
          </View>
        ) : null}
      </View>

      {certs.length > 0 ? (
        <View style={styles.certs}>
          <Award size={14} color={Colors.accent} strokeWidth={ICON_STROKE} style={styles.icon} />
          <AppText variant="footnote" numberOfLines={1} style={styles.shrink}>
            {certs[0]}
            {certs.length > 1 ? `  ${t('card.moreCerts', { count: certs.length - 1 })}` : ''}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Space.md,
    padding: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs,
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
  rate: {
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
    paddingTop: Space.xs,
  },
  certs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
});
