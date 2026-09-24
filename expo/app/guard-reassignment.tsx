import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarX2, Mail, Phone, Receipt } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
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
import { formatScheduled } from '@/components/funnel/format';
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
  const { t } = useTranslation('funnel');
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
      <NavBar title={t('reassign.title')} right={booking ? <StatusBadge status={booking.status} /> : undefined} />
      <Screen padTop={false} contentStyle={styles.content}>
        {state === 'loading' ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard media />
          </>
        ) : state === 'missing' || !booking ? (
          <EmptyState
            icon={CalendarX2}
            title={t('shared.bookingNotFound')}
            message={t('reassign.missingMessage')}
            actionLabel={t('reassign.backToDashboard')}
            onAction={() => router.replace('/(tabs)/admin-home')}
          />
        ) : (
          <>
            <View style={styles.header}>
              <AppText variant="overline" color={Colors.accent}>
                {t('reassign.bookingId', { id: shortId(booking.id) })}
              </AppText>
              <AppText variant="title2">
                {booking.status === 'rejected' ? t('reassign.declinedTitle') : t('reassign.assignmentTitle')}
              </AppText>
            </View>

            <Notice
              tone="info"
              title={t('reassign.noticeTitle')}
              message={t('reassign.noticeMessage')}
            />

            <SectionTitle title={t('reassign.booking')} />
            <Card>
              <InfoRow label={t('reassign.client')} value={client ? fullName(client) : '—'} />
              {/* formatScheduled parses the LOCAL date; new Date('YYYY-MM-DD') is UTC and showed the day before. */}
              <InfoRow label={t('reassign.scheduled')} value={formatScheduled(booking)} />
              <InfoRow label={t('shared.duration')} value={booking.duration ? t('reassign.hours', { count: booking.duration }) : '—'} />
              <InfoRow label={t('shared.pickup')} value={booking.pickupAddress || '—'} />
              <InfoRow
                label={t('shared.paid')}
                value={booking.transactionId ? formatMXN(booking.totalAmount) : t('reassign.notPaid')}
                emphasis
              />
            </Card>

            {declinedGuard || booking.rejectionReason ? (
              <>
                <SectionTitle title={t('reassign.declinedBy')} />
                <Card style={styles.guardRow}>
                  <Avatar
                    name={declinedGuard ? fullName(declinedGuard) : t('reassign.guardFallback')}
                    uri={declinedGuard?.photos?.[0]}
                    size={44}
                  />
                  <View style={styles.flex}>
                    <AppText variant="headline">{declinedGuard ? fullName(declinedGuard) : t('reassign.guardFallback')}</AppText>
                    <AppText variant="footnote">
                      {booking.rejectionReason ? t('shared.quoted', { text: booking.rejectionReason }) : t('reassign.noReason')}
                      {booking.rejectedAt ? ` · ${formatDate(booking.rejectedAt)}` : ''}
                    </AppText>
                  </View>
                </Card>
              </>
            ) : null}

            <SectionTitle title={t('reassign.nextSteps')} />
            <ListGroup>
              {client?.phone ? (
                <ListRow icon={Phone} title={t('reassign.call')} subtitle={client.phone} onPress={() => Linking.openURL(`tel:${client.phone}`).catch(() => {})} />
              ) : null}
              {client?.email ? (
                <ListRow
                  icon={Mail}
                  title={t('reassign.email')}
                  subtitle={client.email}
                  onPress={() =>
                    Linking.openURL(
                      `mailto:${client.email}?subject=${encodeURIComponent(t('reassign.emailSubject', { id: shortId(booking.id) }))}`
                    ).catch(() => {})
                  }
                />
              ) : null}
              <ListRow
                icon={Receipt}
                title={t('reassign.refunds')}
                subtitle={t('reassign.refundsSubtitle')}
                onPress={() => router.push('/admin-refunds')} />
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
