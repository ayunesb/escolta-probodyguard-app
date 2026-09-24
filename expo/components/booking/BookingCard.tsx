import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MapPin, Navigation, RefreshCcw } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Space } from '@/constants/design';
import {
  AppText,
  Badge,
  Button,
  Card,
  PressableScale,
  StatusBadge,
  bookingStatusMeta,
} from '@/components/ui';
import type { Booking, UserRole } from '@/types';
import { isLiveStatus } from '@/services/bookingService';
import {
  PROTECTION_LABEL,
  VEHICLE_LABEL,
  amountForViewer,
  formatDuration,
  formatShortDate,
  formatTime,
  labelOf,
  shortId,
} from './format';
import { StarRating } from './StarRating';

interface BookingCardProps {
  booking: Booking;
  viewerRole: UserRole;
  onPress: () => void;
  onTrack?: () => void;
  onReassign?: () => void;
}

export function BookingCard({
  booking,
  viewerRole,
  onPress,
  onTrack,
  onReassign,
}: BookingCardProps) {
  const { t } = useTranslation('booking');
  const status = bookingStatusMeta(booking.status);
  const amount = amountForViewer(booking, viewerRole);
  const date = formatShortDate(booking);
  const time = formatTime(booking);
  const needsGuardResponse = viewerRole === 'guard' && booking.status === 'confirmed';
  const canTrack = !!onTrack && isLiveStatus(booking.status);
  const canReassign = !!onReassign && viewerRole === 'client' && booking.status === 'rejected';

  return (
    // La tarjeta es un contenedor; la zona pulsable y el boton de accion son
    // hermanos. Antes el boton vivia DENTRO de la tarjeta pulsable: en web eso
    // es un <button> dentro de otro <button> (HTML invalido) y un clic podia
    // disparar las dos acciones.
    <Card padded={false} tone={needsGuardResponse ? 'gold' : 'default'} style={styles.card}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={t('card.a11y', { id: shortId(booking.id), status: status.label, date, time })}
        accessibilityHint={t('card.hint')}
        hoverStyle={{ backgroundColor: Colors.surfaceLight }}
        style={styles.pressArea}
      >
        <View style={styles.header}>
          <View style={styles.when}>
            <AppText variant="headline" numberOfLines={1} style={styles.date}>
              {date}
            </AppText>
            <AppText variant="callout" tabular>
              {time}
            </AppText>
          </View>
          <StatusBadge status={booking.status} />
        </View>

        <View style={styles.row}>
          <MapPin size={15} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
          <AppText variant="callout" numberOfLines={1} style={styles.flex}>
            {booking.pickupAddress || t('card.noPickup')}
          </AppText>
        </View>
        <AppText
          variant="footnote"
          color={Colors.textTertiary}
          numberOfLines={1}
          style={styles.meta}
        >
          {[
            formatDuration(booking.duration),
            labelOf(PROTECTION_LABEL, booking.protectionType),
            labelOf(VEHICLE_LABEL, booking.vehicleType),
          ].join(' · ')}
        </AppText>

        <View style={styles.footer}>
          <View>
            <AppText variant="overline">{amount.label}</AppText>
            <AppText variant="numeric" color={Colors.accentLight} style={styles.amount}>
              {amount.value}
            </AppText>
          </View>
          {needsGuardResponse ? (
            <Badge label={t('card.needsResponse')} tone="accent" />
          ) : typeof booking.rating === 'number' ? (
            <StarRating value={booking.rating} size={14} label={t('card.clientRating')} />
          ) : null}
        </View>
      </PressableScale>

      {canReassign || canTrack ? (
        <View style={styles.actionRow}>
          {canReassign ? (
            <Button
              title={t('shared.chooseAnother')}
              icon={RefreshCcw}
              variant="outline"
              size="sm"
              onPress={onReassign}
              style={styles.action}
              accessibilityLabel={t('shared.chooseAnotherA11y')}
              accessibilityHint={t('card.chooseAnotherHint')}
            />
          ) : canTrack ? (
            <Button
              title={t(viewerRole === 'guard' ? 'shared.openMap' : 'shared.trackProtector')}
              icon={Navigation}
              variant="secondary"
              size="sm"
              onPress={onTrack}
              style={styles.action}
              accessibilityLabel={t(viewerRole === 'guard' ? 'shared.openMap' : 'shared.trackA11y')}
              accessibilityHint={t('card.trackHint')}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  pressArea: {
    padding: Space.lg,
  },
  actionRow: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.md,
    marginBottom: Space.md,
  },
  when: {
    flex: 1,
    gap: 2,
  },
  // Una sola linea: con el interlineado por defecto (1.3) Geist recorta los
  // descendentes ("p", "g").
  date: {
    lineHeight: 23,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  flex: {
    flex: 1,
  },
  meta: {
    marginTop: Space.xs,
    marginLeft: 15 + Space.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.md,
    marginTop: Space.lg,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderStrong,
  },
  amount: {
    marginTop: 2,
  },
  action: {
    marginTop: 0,
  },
});
