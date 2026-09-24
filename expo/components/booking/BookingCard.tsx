import React from 'react';
import { StyleSheet, View } from 'react-native';
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
        accessibilityLabel={`Booking ${shortId(booking.id)}, status ${status.label}, scheduled for ${date} at ${time}`}
        accessibilityHint="Double tap to view booking details"
        hoverStyle={{ backgroundColor: Colors.surfaceLight }}
        style={styles.pressArea}
      >
        <View style={styles.header}>
          <View style={styles.when}>
            <AppText variant="headline" numberOfLines={1}>
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
            {booking.pickupAddress || 'Pickup address not set'}
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
            <AppText variant="numeric" color={Colors.goldLight} style={styles.amount}>
              {amount.value}
            </AppText>
          </View>
          {needsGuardResponse ? (
            <Badge label="Needs your response" tone="gold" />
          ) : typeof booking.rating === 'number' ? (
            <StarRating value={booking.rating} size={14} label="Client rating" />
          ) : null}
        </View>
      </PressableScale>

      {canReassign || canTrack ? (
        <View style={styles.actionRow}>
          {canReassign ? (
            <Button
              title="Choose another protector"
              icon={RefreshCcw}
              variant="outline"
              size="sm"
              onPress={onReassign}
              style={styles.action}
              accessibilityLabel="Select another guard"
              accessibilityHint="Choose a different protector for this booking"
            />
          ) : canTrack ? (
            <Button
              title={viewerRole === 'guard' ? 'Open map' : 'Track protector'}
              icon={Navigation}
              variant="secondary"
              size="sm"
              onPress={onTrack}
              style={styles.action}
              accessibilityLabel={viewerRole === 'guard' ? 'Open map' : 'Track guard location'}
              accessibilityHint="Opens the live map for this booking"
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
