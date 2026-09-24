import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Award, Languages, MapPin, Star } from 'lucide-react-native';
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
    isVerified(guard) ? 'verified' : null,
    hasRating(guard) ? `rated ${guard.rating.toFixed(1)} from ${guard.completedJobs} jobs` : 'new protector',
    showRate && guard.hourlyRate > 0 ? `${formatMXN(guard.hourlyRate)} per hour` : null,
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
  const name = guardDisplayName(guard);
  const rated = hasRating(guard);
  const languages = guard.languages.map(languageName);
  const certs = guard.certifications;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={guardA11yLabel(guard, { distanceKm, showRate })}
      accessibilityHint={accessibilityHint ?? 'Opens the profile to book protection'}
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
                <Star size={13} color={Colors.accent} fill={Colors.accent} strokeWidth={ICON_STROKE} />
                <AppText variant="footnote" color={Colors.textPrimary} tabular>
                  {guard.rating.toFixed(1)}
                </AppText>
                <AppText variant="footnote" color={Colors.textTertiary}>
                  · {guard.completedJobs} {guard.completedJobs === 1 ? 'job' : 'jobs'}
                </AppText>
              </>
            ) : (
              <Badge label="New to Escolta" tone="neutral" />
            )}
          </View>

          {languages.length > 0 || typeof distanceKm === 'number' ? (
            <View style={styles.metaRow}>
              {languages.length > 0 ? (
                <>
                  <Languages size={13} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
                  <AppText variant="caption" numberOfLines={1} style={styles.shrink}>
                    {languages.join(' · ')}
                  </AppText>
                </>
              ) : null}
              {typeof distanceKm === 'number' ? (
                <>
                  <MapPin size={13} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
                  <AppText variant="caption">{formatDistance(distanceKm)}</AppText>
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
              per hour
            </AppText>
          </View>
        ) : null}
      </View>

      {certs.length > 0 ? (
        <View style={styles.certs}>
          <Award size={14} color={Colors.accent} strokeWidth={ICON_STROKE} />
          <AppText variant="footnote" numberOfLines={1} style={styles.shrink}>
            {certs[0]}
            {certs.length > 1 ? `  +${certs.length - 1} more` : ''}
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
