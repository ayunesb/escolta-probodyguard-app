import { openContact } from '@/utils/openContact';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
  PhotoCard,
} from '@/components/ui';
import { BrandImages } from '@/constants/brandMedia';
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
  saveTextFile,
  shortId,
  toCSV,
  todayEyebrow,
} from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { emergencyService } from '@/services/emergencyService';
import i18n from '@/i18n';
import { UserRecord, userService } from '@/services/userService';
import type { Booking } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

interface GuardCounts {
  total: number;
  approved: number;
  pending: number;
}

const ALERT_TYPES = ['panic', 'sos', 'medical', 'security'] as const;
type AlertType = (typeof ALERT_TYPES)[number];

// Se traduce en cada llamada (sigue al idioma activo).
const alertLabel = (type?: string): string =>
  ALERT_TYPES.includes(type as AlertType)
    ? i18n.t(`backoffice:adminHome.alerts.${type as AlertType}`)
    : i18n.t('backoffice:adminHome.alerts.fallback');

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
  const { t } = useTranslation(['backoffice', 'common']);
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [guards, setGuards] = useState<GuardCounts | null>(null);
  const [alerts, setAlerts] = useState<EmergencyAlertRow[]>([]);
  const [people, setPeople] = useState<Record<string, UserRecord>>({});
  const [loadError, setLoadError] = useState(false);
  const [alertsError, setAlertsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
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
      setLoadError(true);
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
      ...loaded.filter((b) => b.status === 'rejected' && isPaid(b) && b.paymentStatus !== 'refunded').slice(0, 5),
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
    const cancelledPaid = list.filter((b) => b.status === 'cancelled' && isPaid(b) && b.paymentStatus !== 'refunded');
    return {
      total: list.length,
      inProgress: list.filter((b) => ACTIVE_STATUSES.includes(b.status)).length,
      awaitingGuard: list.filter((b) => b.status === 'confirmed').length,
      completed: completed.length,
      gross: completed.reduce((s, b) => s + money(b.totalAmount), 0),
      platform: completed.reduce((s, b) => s + money(b.platformCut), 0),
      declined: list.filter((b) => b.status === 'rejected' && isPaid(b) && b.paymentStatus !== 'refunded'),
      refundCandidates: cancelledPaid.length + list.filter((b) => b.status === 'rejected' && isPaid(b) && b.paymentStatus !== 'refunded').length,
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
        title: t('adminHome.ledgerTitle'),
      });
      const message = describeSave(result, t('adminHome.ledgerWhat', { count: bookings.length }));
      if (message) setNotice({ tone: 'success', message });
    } catch (error) {
      logger.error('[AdminHome] CSV export failed', error);
      setNotice({ tone: 'error', message: t('adminHome.exportError') });
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
      setNotice({ tone: 'error', message: t('adminHome.alertUpdateError') });
    }
  };

  const loading = bookings === null && !loadError;

  return (
    <Screen glow refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>
      <ScreenHeader
        eyebrow={todayEyebrow()}
        title={t('adminHome.title')}
        subtitle={t('adminHome.subtitle')}
        right={
          <IconButton
            icon={Download}
            onPress={exportLedger}
            disabled={exporting || !bookings || bookings.length === 0}
            accessibilityLabel={t('adminHome.exportA11y')}
          />
        }
      />

      <PhotoCard
        image={BrandImages.opsRoom}
        eyebrow={t('adminHome.bannerEyebrow')}
        title={t('adminHome.bannerTitle')}
        caption={t('adminHome.bannerCaption')}
        height={190}
        style={{ marginBottom: Space.xl }}
      />

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.block} /> : null}

      {alerts.length > 0 ? (
        <View style={styles.block}>
          <SectionTitle title={t('adminHome.alertsTitle', { count: alerts.length })} style={styles.firstSection} />
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
                      <AppText variant="headline">{alertLabel(a.type)}</AppText>
                      <AppText variant="footnote">
                        {[
                          person ? fullName(person) : t('people.unknownMember'),
                          formatDateTime(a.timestamp),
                          a.bookingId ? t('adminHome.alertBooking', { id: shortId(a.bookingId) }) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="caption" color={loc ? Colors.textSecondary : Colors.warning}>
                    {loc
                      ? loc.address || `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`
                      : t('adminHome.noLocation')}
                  </AppText>
                  <View style={styles.actions}>
                    {loc ? (
                      <Button
                        title={t('adminHome.map')}
                        icon={MapPin}
                        variant="secondary"
                        size="sm"
                        fullWidth={false}
                        onPress={() => openDocument(`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`)}
                        accessibilityLabel={t('adminHome.mapA11y')}
                      />
                    ) : null}
                    {person?.phone ? (
                      <Button
                        title={t('adminHome.call')}
                        icon={Phone}
                        variant="secondary"
                        size="sm"
                        fullWidth={false}
                        onPress={() => openContact(`tel:${person.phone}`).catch(() => {})}
                        accessibilityLabel={t('adminHome.callA11y', { name: fullName(person) })}
                      />
                    ) : null}
                    <Button
                      title={t('adminHome.resolved')}
                      variant="outline"
                      size="sm"
                      fullWidth={false}
                      loading={resolvingId === a.id}
                      onPress={() => resolveAlert(a, 'resolved')}
                      accessibilityLabel={t('adminHome.resolvedA11y')}
                    />
                    <Button
                      title={t('adminHome.falseAlarm')}
                      variant="ghost"
                      size="sm"
                      fullWidth={false}
                      disabled={resolvingId === a.id}
                      onPress={() => resolveAlert(a, 'false_alarm')}
                      accessibilityLabel={t('adminHome.falseAlarmA11y')}
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      ) : null}

      {alertsError ? (
        <Notice tone="warning" message={t('adminHome.alertsError')} style={styles.block} />
      ) : null}

      {guards && guards.pending > 0 ? (
        <Card tone="accent" onPress={() => router.push('/(tabs)/admin-kyc')} accessibilityLabel={t('adminHome.kycA11y')} style={styles.kycCard}>
          <ShieldCheck size={20} color={Colors.accent} />
          <View style={styles.flex}>
            <AppText variant="headline">{t('adminHome.kycWaiting', { count: guards.pending })}</AppText>
            <AppText variant="footnote">{t('adminHome.kycMessage')}</AppText>
          </View>
        </Card>
      ) : null}

      <SectionTitle title={t('adminHome.bookings')} />
      {loadError ? (
        <Notice tone="error" message={t('adminHome.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} />
      ) : loading ? (
        <View style={styles.grid}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </View>
      ) : (
        <View style={styles.gridWrap}>
          <View style={styles.grid}>
            <StatTile
              label={t('adminHome.bookings')}
              value={stats.total}
              hint={t('adminHome.statInProgress', { count: stats.inProgress })}
              icon={CalendarCheck}
            />
            <StatTile
              label={t('adminHome.statCompleted')}
              value={stats.completed}
              hint={t('adminHome.statOfAll', { percent: percent(stats.completed, stats.total) })}
              icon={ShieldCheck}
            />
          </View>
          <View style={styles.grid}>
            <StatTile label={t('shared.clientPayments')} value={formatMXN(stats.gross)} hint={t('shared.completedJobs')} icon={Wallet} />
            <StatTile
              label={t('shared.platformFees')}
              value={formatMXN(stats.platform)}
              hint={t('shared.completedJobs')}
              icon={Receipt}
              accent
            />
          </View>
          <View style={styles.grid}>
            <StatTile
              label={t('adminHome.statGuards')}
              value={guards ? guards.total : '—'}
              hint={guards ? t('adminHome.statVerified', { count: guards.approved }) : undefined}
              icon={Users}
            />
            <StatTile
              label={t('adminHome.statAwaiting')}
              value={stats.awaitingGuard}
              hint={t('adminHome.statAwaitingHint')}
              icon={UserRoundX}
            />
          </View>
        </View>
      )}

      {stats.declined.length > 0 ? (
        <>
          <SectionTitle title={t('adminHome.declinedTitle')} />
          <ListGroup>
            {stats.declined.slice(0, 5).map((b) => {
              const client = people[b.clientId];
              return (
                <ListRow
                  key={b.id}
                  icon={UserRoundX}
                  title={`${shortId(b.id)} · ${client ? fullName(client) : t('people.client')}`}
                  subtitle={`${
                    b.rejectionReason ? t('adminHome.declinedWithReason', { reason: b.rejectionReason }) : t('adminHome.declined')
                  } · ${formatDate(b.scheduledDate)}`}
                  value={formatMXN(b.totalAmount)}
                  onPress={() =>
                    router.push({ pathname: '/guard-reassignment', params: { bookingId: b.id, currentGuardId: b.guardId ?? '' } })
                  }
                  accessibilityHint={t('adminHome.declinedHint')}
                />
              );
            })}
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title={t('adminHome.backOffice')} />
      <ListGroup>
        <ListRow
          icon={ShieldCheck}
          title={t('adminHome.kycRow')}
          subtitle={t('adminHome.kycRowSubtitle')}
          value={guards ? (guards.pending > 0 ? t('adminHome.kycPending', { count: guards.pending }) : t('adminHome.upToDate')) : undefined}
          onPress={() => router.push('/(tabs)/admin-kyc')}
        />
        <ListRow
          icon={Users}
          title={t('adminHome.membersRow')}
          subtitle={t('adminHome.membersRowSubtitle')}
          onPress={() => router.push('/(tabs)/admin-users')}
        />
        <ListRow
          icon={ChartColumn}
          title={t('adminHome.analyticsRow')}
          subtitle={t('adminHome.analyticsRowSubtitle')}
          onPress={() => router.push('/admin-analytics')}
        />
        <ListRow
          icon={Receipt}
          title={t('adminHome.refundsRow')}
          subtitle={t('adminHome.refundsRowSubtitle')}
          value={bookings ? String(stats.refundCandidates) : undefined}
          onPress={() => router.push('/admin-refunds')}
        />
        <ListRow
          icon={History}
          title={t('adminHome.auditRow')}
          subtitle={t('adminHome.auditRowSubtitle')}
          onPress={() => router.push('/admin/kyc-audit')}
        />
      </ListGroup>

      <SectionTitle
        title={t('adminHome.recentBookings')}
        action={
          bookings && bookings.length > 0 ? (
            <Button title={t('adminHome.exportCsv')} icon={Download} variant="ghost" size="sm" fullWidth={false} loading={exporting} onPress={exportLedger} />
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
          <EmptyState icon={CalendarCheck} title={t('adminHome.emptyTitle')} message={t('adminHome.emptyMessage')} />
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
                  {t('adminHome.route', {
                    client: client ? fullName(client) : t('people.client'),
                    guard: guard ? fullName(guard) : b.guardId ? t('people.guard') : t('people.noGuard'),
                  })}
                </AppText>
                <View style={styles.rowHead}>
                  <AppText variant="caption" color={Colors.textTertiary} style={styles.flex}>
                    {[
                      formatDate(b.scheduledDate),
                      b.scheduledTime || null,
                      // Espacio duro: "4 h" no se parte en dos renglones
                      b.duration ? t('common:units.hoursShort', { count: b.duration }).replace(' ', '\u00A0') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                  {isPaid(b) ? <Badge label={t('adminHome.paid')} tone="success" style={styles.badgeCenter} /> : null}
                  <AppText variant="numeric" color={Colors.accentLight}>
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
  // Badge trae alignSelf: 'flex-start'; en una fila centrada se ve subido.
  badgeCenter: {
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
});
