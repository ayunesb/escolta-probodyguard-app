import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarX2, Mail, Phone, Receipt } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Card,
  EmptyState,
  InfoRow,
  ListGroup,
  ListRow,
  NavBar,
  Screen,
  SectionTitle,
  SkeletonCard,
  StatusBadge,
} from '@/components/ui';
import { Notice, RoleGate, formatDate, fullName, shortId } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { bookingService } from '@/services/bookingService';
import { UserRecord, userService } from '@/services/userService';
import type { Booking } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

// Antes era una pantalla con escoltas de mocks/guards.ts que decia "el
// cliente sera notificado" y solo hacia console.log. Ahora:
// - el cliente de la reserva va al flujo real (booking/select-guard), que usa
//   bookingService.reassignGuard (rechazada -> confirmada, mismo pago);
// - un admin ve la reserva real y, con honestidad, que la reasignacion la
//   decide el cliente (bookingService.reassignGuard solo acepta al cliente).
export default function GuardReassignmentRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['admin', 'client']} nav>
        <GuardReassignmentScreen />
      </RoleGate>
    </>
  );
}

function GuardReassignmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { bookingId, currentGuardId } = useLocalSearchParams<{ bookingId?: string; currentGuardId?: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [people, setPeople] = useState<Record<string, UserRecord>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  const load = useCallback(async () => {
    if (!bookingId) {
      setState('missing');
      return;
    }
    setState('loading');
    const found = await bookingService.getBookingById(bookingId);
    if (!found) {
      setState('missing');
      return;
    }
    setBooking(found);
    setState('ready');
    try {
      setPeople(await userService.getUsersByIds([found.clientId, found.guardId, currentGuardId]));
    } catch (error) {
      logger.error('[GuardReassignment] Failed to load people', error);
    }
  }, [bookingId, currentGuardId]);

  const isClient = user?.role === 'client';

  useEffect(() => {
    if (!isClient) load();
  }, [isClient, load]);

  if (isClient) {
    return <Redirect href={{ pathname: '/booking/select-guard', params: { bookingId: bookingId ?? '' } }} />;
  }

  const client = booking ? people[booking.clientId] : undefined;
  const declinedGuardId = booking?.status === 'rejected' ? booking.guardId : currentGuardId;
  const declinedGuard = declinedGuardId ? people[declinedGuardId] : undefined;

  return (
    <View style={styles.root}>
      <NavBar title="Reassign guard" right={booking ? <StatusBadge status={booking.status} /> : undefined} />
      <Screen padTop={false} contentStyle={styles.content}>
        {state === 'loading' ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard media />
          </>
        ) : state === 'missing' || !booking ? (
          <EmptyState
            icon={CalendarX2}
            title="Booking not found"
            message="Open reassignment from a declined booking on the admin dashboard."
            actionLabel="Back to dashboard"
            onAction={() => router.replace('/(tabs)/admin-home')}
          />
        ) : (
          <>
            <View style={styles.header}>
              <AppText variant="overline" color={Colors.gold}>
                Booking {shortId(booking.id)}
              </AppText>
              <AppText variant="title2">
                {booking.status === 'rejected' ? 'Declined — needs a new guard' : 'Guard assignment'}
              </AppText>
            </View>

            <Notice
              tone="info"
              title="The client chooses the new guard"
              message="When a guard declines a paid booking, the client picks someone else from their booking and the same payment carries over. Admin reassignment isn't available in the app yet — contact the client, or refund the payment if they no longer want the service."
            />

            <SectionTitle title="Booking" />
            <Card>
              <InfoRow label="Client" value={client ? fullName(client) : '—'} />
              <InfoRow label="Scheduled" value={`${formatDate(booking.scheduledDate)}${booking.scheduledTime ? ` · ${booking.scheduledTime}` : ''}`} />
              <InfoRow label="Duration" value={booking.duration ? `${booking.duration} h` : '—'} />
              <InfoRow label="Pickup" value={booking.pickupAddress || '—'} />
              <InfoRow label="Paid" value={booking.transactionId ? formatMXN(booking.totalAmount) : 'Not paid'} emphasis />
            </Card>

            {declinedGuard || booking.rejectionReason ? (
              <>
                <SectionTitle title="Declined by" />
                <Card style={styles.guardRow}>
                  <Avatar name={declinedGuard ? fullName(declinedGuard) : 'Guard'} uri={declinedGuard?.photos?.[0]} size={44} />
                  <View style={styles.flex}>
                    <AppText variant="headline">{declinedGuard ? fullName(declinedGuard) : 'Guard'}</AppText>
                    <AppText variant="footnote">
                      {booking.rejectionReason ? `“${booking.rejectionReason}”` : 'No reason given'}
                      {booking.rejectedAt ? ` · ${formatDate(booking.rejectedAt)}` : ''}
                    </AppText>
                  </View>
                </Card>
              </>
            ) : null}

            <SectionTitle title="Next steps" />
            <ListGroup>
              {client?.phone ? (
                <ListRow icon={Phone} title="Call the client" subtitle={client.phone} onPress={() => Linking.openURL(`tel:${client.phone}`).catch(() => {})} />
              ) : null}
              {client?.email ? (
                <ListRow
                  icon={Mail}
                  title="Email the client"
                  subtitle={client.email}
                  onPress={() => Linking.openURL(`mailto:${client.email}?subject=${encodeURIComponent(`Your booking ${shortId(booking.id)}`)}`).catch(() => {})}
                />
              ) : null}
              <ListRow icon={Receipt} title="Refunds" subtitle="Refund the payment in Stripe and record it" onPress={() => router.push('/admin-refunds')} />
            </ListGroup>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingTop: Space.xl,
  },
  header: {
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  guardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  flex: {
    flex: 1,
  },
});
