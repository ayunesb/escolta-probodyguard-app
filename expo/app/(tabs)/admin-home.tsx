import { useCallback, useMemo, useState } from 'react';
import { Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import {
  CalendarCheck,
  ChartColumn,
  Download,
  History,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  Siren,
  UserRoundX,
  Users,
  Wallet,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SectionTitle,
  SkeletonCard,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import {
  ACTIVE_STATUSES,
  EmergencyAlertRow,
  Notice,
  RoleGate,
  describeSave,
  fetchActiveEmergencyAlerts,
  fetchAllBookings,
  fileStamp,
  formatDate,
  formatDateTime,
  fullName,
  isPaid,
  money,
  openDocument,
  percent,
  plural,
  saveTextFile,
  shortId,
  toCSV,
  todayEyebrow,
} from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { emergencyService } from '@/services/emergencyService';
import { UserRecord, userService } from '@/services/userService';
import type { Booking } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

interface GuardCounts {
  total: number;
  approved: number;
  pending: number;
}

const ALERT_LABEL: Record<string, string> = {
  panic: 'Panic — immediate danger',
  sos: 'SOS — urgent help',
  medical: 'Medical emergency',
  security: 'Security threat',
};

export default function AdminHomeRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['admin']}>
        <AdminHomeScreen />
      </RoleGate>
    </>
  );
}

function AdminHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [guards, setGuards] = useState<GuardCounts | null>(null);
  const [alerts, setAlerts] = useState<EmergencyAlertRow[]>([]);
  const [people, setPeople] = useState<Record<string, UserRecord>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const [bookingsResult, countsResult, alertsResult] = await Promise.allSettled([
      fetchAllBookings(),
      Promise.all([
        userService.countUsers({ role: 'guard' }),
        userService.countUsers({ role: 'guard', kycStatus: 'approved' }),
        userService.countUsers({ role: 'guard', kycStatus: 'pending' }),
      ]),
      fetchActiveEmergencyAlerts(),
    ]);

    let loaded: Booking[] = [];
    if (bookingsResult.status === 'fulfilled') {
      loaded = bookingsResult.value;
      setBookings(loaded);
    } else {
      logger.error('[AdminHome] Failed to load bookings', bookingsResult.reason);
      setLoadError('We could not load platform bookings.');
    }
    if (countsResult.status === 'fulfilled') {
      const [total, approved, pending] = countsResult.value;
      setGuards({ total, approved, pending });
    } else {
      logger.error('[AdminHome] Failed to count guards', countsResult.reason);
    }
    let activeAlerts: EmergencyAlertRow[] = [];
    if (alertsResult.status === 'fulfilled') {
      activeAlerts = alertsResult.value;
      setAlerts(activeAlerts);
      setAlertsError(false);
    } else {
      logger.error('[AdminHome] Failed to load emergency alerts', alertsResult.reason);
      setAlertsError(true);
    }

    // Nombres solo de lo que se muestra (reservas recientes, rechazadas, alertas).
    const shown = [
      ...loaded.slice(0, 8),
      ...loaded.filter((b) => b.status === 'rejected' && isPaid(b)).slice(0, 5),
    ];
    const ids = [...shown.flatMap((b) => [b.clientId, b.guardId]), ...activeAlerts.map((a) => a.userId)];
    setPeople(await userService.getUsersByIds(ids));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stats = useMemo(() => {
    const list = bookings ?? [];
    const completed = list.filter((b) => b.status === 'completed');
    const cancelledPaid = list.filter((b) => b.status === 'cancelled' && isPaid(b));
    return {
      total: list.length,
      inProgress: list.filter((b) => ACTIVE_STATUSES.includes(b.status)).length,
      awaitingGuard: list.filter((b) => b.status === 'confirmed').length,
      completed: completed.length,
      gross: completed.reduce((s, b) => s + money(b.totalAmount), 0),
      platform: completed.reduce((s, b) => s + money(b.platformCut), 0),
      declined: list.filter((b) => b.status === 'rejected' && isPaid(b)),
      refundCandidates: cancelledPaid.length + list.filter((b) => b.status === 'rejected' && isPaid(b)).length,
    };
  }, [bookings]);

  const exportLedger = async () => {
    if (!bookings || bookings.length === 0) return;
    setExporting(true);
    setNotice(null);
    try {
      const csv = toCSV(
        [
          'Booking ID',
          'Created',
          'Scheduled date',
          'Scheduled time',
          'Status',
          'Client ID',
          'Guard ID',
          'Duration (h)',
          'Protectors',
          'Total (MXN)',
          'Processing fee (MXN)',
          'Platform fee (MXN)',
          'Guard payout (MXN)',
          'Paid',
          'Transaction ID',
        ],
        bookings.map((b) => [
          b.id,
          b.createdAt ?? '',
          b.scheduledDate ?? '',
          b.scheduledTime ?? '',
          b.status,
          b.clientId ?? '',
          b.guardId ?? '',
          b.duration ?? '',
          b.numberOfProtectors ?? '',
          money(b.totalAmount).toFixed(2),
          money(b.processingFee).toFixed(2),
          money(b.platformCut).toFixed(2),
          money(b.guardPayout).toFixed(2),
          isPaid(b) ? 'yes' : 'no',
          b.transactionId ?? '',
        ])
      );
      const result = await saveTextFile({
        filename: `escolta-pro-bookings-${fileStamp()}.csv`,
        content: csv,
        mimeType: 'text/csv',
        title: 'Escolta Pro bookings ledger',
      });
      const message = describeSave(result, `Ledger with ${plural(bookings.length, 'booking')}`);
      if (message) setNotice({ tone: 'success', message });
    } catch (error) {
      logger.error('[AdminHome] CSV export failed', error);
      setNotice({ tone: 'error', message: 'The ledger could not be exported. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const resolveAlert = async (alert: EmergencyAlertRow, status: 'resolved' | 'false_alarm') => {
    setResolvingId(alert.id);
    const ok = await emergencyService.resolveAlert(alert.id, status, undefined, user?.id);
    setResolvingId(null);
    if (ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } else {
      setNotice({ tone: 'error', message: 'The alert could not be updated. Please try again.' });
    }
  };

  const loading = bookings === null && !loadError;

  return (
    <Screen glow refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>
      <ScreenHeader
        eyebrow={todayEyebrow()}
        title="Operations"
        subtitle="The state of Escolta Pro at a glance."
        right={
          <IconButton
            icon={Download}
            onPress={exportLedger}
            disabled={exporting || !bookings || bookings.length === 0}
            accessibilityLabel="Export bookings ledger as CSV"
          />
        }
      />

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.block} /> : null}

      {alerts.length > 0 ? (
        <View style={styles.block}>
          <SectionTitle title={`Emergency alerts · ${alerts.length}`} style={styles.firstSection} />
          <View style={styles.list}>
            {alerts.map((a) => {
              const person = people[a.userId];
              const loc = a.location;
              return (
                <Card key={a.id} tone="raised" style={styles.alertCard}>
                  <View style={styles.rowHead}>
                    <View style={styles.alertIcon}>
                      <Siren size={18} color={Colors.error} />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="headline">{ALERT_LABEL[a.type ?? ''] ?? 'Emergency alert'}</AppText>
                      <AppText variant="footnote">
                        {person ? fullName(person) : 'Unknown member'} · {formatDateTime(a.timestamp)}
                        {a.bookingId ? ` · Booking ${shortId(a.bookingId)}` : ''}
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="caption" color={loc ? Colors.textSecondary : Colors.warning}>
                    {loc
                      ? loc.address || `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
                      : 'Location not shared by the device'}
                  </AppText>
                  <View style={styles.actions}>
                    {loc ? (
                      <Button
                        title="Map"
                        icon={MapPin}
                        variant="secondary"
                        size="sm"
                        fullWidth={false}
                        onPress={() => openDocument(`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`)}
                        accessibilityLabel="Open alert location on a map"
                      />
                    ) : null}
                    {person?.phone ? (
                      <Button
                        title="Call"
                        icon={Phone}
                        variant="secondary"
                        size="sm"
                        fullWidth={false}
                        onPress={() => Linking.openURL(`tel:${person.phone}`).catch(() => {})}
                        accessibilityLabel={`Call ${fullName(person)}`}
                      />
                    ) : null}
                    <Button
                      title="Resolved"
                      variant="outline"
                      size="sm"
                      fullWidth={false}
                      loading={resolvingId === a.id}
                      onPress={() => resolveAlert(a, 'resolved')}
                      accessibilityLabel="Mark alert as resolved"
                    />
                    <Button
                      title="False alarm"
                      variant="ghost"
                      size="sm"
                      fullWidth={false}
                      disabled={resolvingId === a.id}
                      onPress={() => resolveAlert(a, 'false_alarm')}
                      accessibilityLabel="Mark alert as a false alarm"
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      ) : null}

      {alertsError ? (
        <Notice tone="warning" message="Emergency alerts could not be checked. Pull to refresh." style={styles.block} />
      ) : null}

      {guards && guards.pending > 0 ? (
        <Card tone="gold" onPress={() => router.push('/(tabs)/admin-kyc')} accessibilityLabel="Review pending verifications" style={styles.kycCard}>
          <ShieldCheck size={20} color={Colors.gold} />
          <View style={styles.flex}>
            <AppText variant="headline">{plural(guards.pending, 'guard')} waiting for verification</AppText>
            <AppText variant="footnote">Review documents before they can accept bookings.</AppText>
          </View>
        </Card>
      ) : null}

      <SectionTitle title="Bookings" />
      {loadError ? (
        <Notice tone="error" message={loadError} actionLabel="Try again" onAction={load} />
      ) : loading ? (
        <View style={styles.grid}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </View>
      ) : (
        <View style={styles.gridWrap}>
          <View style={styles.grid}>
            <StatTile label="Bookings" value={stats.total} hint={`${stats.inProgress} in progress`} icon={CalendarCheck} />
            <StatTile label="Completed" value={stats.completed} hint={`${percent(stats.completed, stats.total)} of all`} icon={ShieldCheck} />
          </View>
          <View style={styles.grid}>
            <StatTile label="Client payments" value={formatMXN(stats.gross)} hint="Completed jobs" icon={Wallet} />
            <StatTile label="Platform fees" value={formatMXN(stats.platform)} hint="Completed jobs" icon={Receipt} accent />
          </View>
          <View style={styles.grid}>
            <StatTile label="Guards" value={guards ? guards.total : '—'} hint={guards ? `${guards.approved} verified` : undefined} icon={Users} />
            <StatTile label="Awaiting guard" value={stats.awaitingGuard} hint="Paid, not yet accepted" icon={UserRoundX} />
          </View>
        </View>
      )}

      {stats.declined.length > 0 ? (
        <>
          <SectionTitle title="Declined — waiting on the client" />
          <ListGroup>
            {stats.declined.slice(0, 5).map((b) => {
              const client = people[b.clientId];
              return (
                <ListRow
                  key={b.id}
                  icon={UserRoundX}
                  title={`${shortId(b.id)} · ${client ? fullName(client) : 'Client'}`}
                  subtitle={`Declined${b.rejectionReason ? `: ${b.rejectionReason}` : ''} · ${formatDate(b.scheduledDate)}`}
                  value={formatMXN(b.totalAmount)}
                  onPress={() =>
                    router.push({ pathname: '/guard-reassignment', params: { bookingId: b.id, currentGuardId: b.guardId ?? '' } })
                  }
                  accessibilityHint="Opens booking details and next steps"
                />
              );
            })}
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title="Back office" />
      <ListGroup>
        <ListRow
          icon={ShieldCheck}
          title="Guard verification"
          subtitle="Review identity and license documents"
          value={guards ? (guards.pending > 0 ? `${guards.pending} pending` : 'Up to date') : undefined}
          onPress={() => router.push('/(tabs)/admin-kyc')}
        />
        <ListRow icon={Users} title="Members" subtitle="Search, edit and suspend accounts" onPress={() => router.push('/(tabs)/admin-users')} />
        <ListRow icon={ChartColumn} title="Analytics" subtitle="Bookings, revenue and members" onPress={() => router.push('/admin-analytics')} />
        <ListRow
          icon={Receipt}
          title="Refunds"
          subtitle="Paid bookings that were cancelled or declined"
          value={bookings ? String(stats.refundCandidates) : undefined}
          onPress={() => router.push('/admin-refunds')}
        />
        <ListRow icon={History} title="KYC audit trail" subtitle="Every upload and decision" onPress={() => router.push('/admin/kyc-audit')} />
      </ListGroup>

      <SectionTitle
        title="Recent bookings"
        action={
          bookings && bookings.length > 0 ? (
            <Button title="Export CSV" icon={Download} variant="ghost" size="sm" fullWidth={false} loading={exporting} onPress={exportLedger} />
          ) : undefined
        }
      />
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : !bookings || bookings.length === 0 ? (
        loadError ? null : (
          <EmptyState icon={CalendarCheck} title="No bookings yet" message="Bookings appear here as soon as clients create them." />
        )
      ) : (
        <View style={styles.list}>
          {bookings.slice(0, 8).map((b) => {
            const client = people[b.clientId];
            const guard = b.guardId ? people[b.guardId] : undefined;
            return (
              <Card key={b.id} style={styles.bookingCard}>
                <View style={styles.rowHead}>
                  <AppText variant="headline" style={styles.flex} numberOfLines={1}>
                    {shortId(b.id)}
                  </AppText>
                  <StatusBadge status={b.status} />
                </View>
                <AppText variant="footnote" numberOfLines={1}>
                  {client ? fullName(client) : 'Client'} → {guard ? fullName(guard) : b.guardId ? 'Guard' : 'No guard'}
                </AppText>
                <View style={styles.rowHead}>
                  <AppText variant="caption" color={Colors.textTertiary} style={styles.flex}>
                    {formatDate(b.scheduledDate)}
                    {b.scheduledTime ? ` · ${b.scheduledTime}` : ''}
                    {b.duration ? ` · ${b.duration} h` : ''}
                  </AppText>
                  {isPaid(b) ? <Badge label="Paid" tone="success" /> : null}
                  <AppText variant="numeric" color={Colors.goldLight}>
                    {formatMXN(b.totalAmount)}
                  </AppText>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: Space.md,
  },
  firstSection: {
    marginTop: 0,
  },
  list: {
    gap: Space.md,
  },
  alertCard: {
    gap: Space.md,
    borderColor: Colors.error,
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  kycCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  gridWrap: {
    gap: Space.md,
  },
  grid: {
    flexDirection: 'row',
    gap: Space.md,
  },
  bookingCard: {
    gap: Space.xs,
  },
  flex: {
    flex: 1,
  },
});
