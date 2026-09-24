import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ban, CalendarCheck, CircleCheck, Clock, Receipt, Star, Wallet } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import {
  AppText,
  bookingStatusMeta,
  Card,
  EmptyState,
  InfoRow,
  NavBar,
  Screen,
  SectionTitle,
  SegmentedControl,
  SkeletonCard,
  StatTile,
} from '@/components/ui';
import type { Tone } from '@/components/ui';
import { Notice, RoleGate, bookingTime, fetchAllBookings, formatDateTime, fullName, money, percent } from '@/components/backoffice';
import { withErrorBoundary } from '@/components/CriticalScreenErrorBoundary';
import i18n from '@/i18n';
import { formatNumber } from '@/i18n/format';
import { UserRecord, userService } from '@/services/userService';
import type { Booking, BookingStatus } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

type Range = '30' | '90' | 'all';

const TONE_COLOR: Record<Tone, string> = {
  neutral: Colors.textSecondary,
  accent: Colors.accent,
  gold: Colors.accent,
  success: Colors.success,
  warning: Colors.warning,
  error: Colors.error,
  info: Colors.info,
};

const STATUS_ORDER: BookingStatus[] = ['pending', 'confirmed', 'accepted', 'en_route', 'active', 'completed', 'rejected', 'cancelled'];

interface MemberCounts {
  clients: number;
  guards: number;
  companies: number;
  verified: number;
  pendingKyc: number;
  rejectedKyc: number;
  available: number;
  suspended: number;
}

function AdminAnalyticsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['admin']} nav>
        <AdminAnalyticsScreen />
      </RoleGate>
    </>
  );
}

function AdminAnalyticsScreen() {
  const { t } = useTranslation(['backoffice', 'common']);
  const [range, setRange] = useState<Range>('30');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [members, setMembers] = useState<MemberCounts | null>(null);
  const [guardNames, setGuardNames] = useState<Record<string, UserRecord>>({});
  const [error, setError] = useState(false);
  const [membersError, setMembersError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  // Lecturas de una sola vez (sin listeners): reservas de RTDB y conteos de
  // usuarios en el servidor de Firestore.
  const load = useCallback(async () => {
    setError(false);
    setMembersError(false);
    const count = userService.countUsers.bind(userService);
    const [bookingsResult, membersResult] = await Promise.allSettled([
      fetchAllBookings(),
      Promise.all([
        count({ role: 'client' }),
        count({ role: 'guard' }),
        count({ role: 'company' }),
        count({ role: 'guard', kycStatus: 'approved' }),
        count({ role: 'guard', kycStatus: 'pending' }),
        count({ role: 'guard', kycStatus: 'rejected' }),
        count({ role: 'guard', availability: true }),
        count({ suspended: true }),
      ]),
    ]);

    if (bookingsResult.status === 'fulfilled') {
      setBookings(bookingsResult.value);
    } else {
      logger.error('[AdminAnalytics] Failed to load bookings', bookingsResult.reason);
      setError(true);
    }
    if (membersResult.status === 'fulfilled') {
      const [clients, guards, companies, verified, pendingKyc, rejectedKyc, available, suspended] = membersResult.value;
      setMembers({ clients, guards, companies, verified, pendingKyc, rejectedKyc, available, suspended });
    } else {
      logger.error('[AdminAnalytics] Failed to count members', membersResult.reason);
      setMembersError(true);
    }
    setLoadedAt(new Date());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const data = useMemo(() => {
    const all = bookings ?? [];
    const since = range === 'all' ? 0 : Date.now() - Number(range) * 24 * 60 * 60 * 1000;
    const list = all.filter((b) => bookingTime(b) >= since);
    const completed = list.filter((b) => b.status === 'completed');
    const cancelled = list.filter((b) => b.status === 'cancelled');
    const rated = completed.filter((b) => typeof b.rating === 'number' && b.rating > 0);
    const gross = completed.reduce((s, b) => s + money(b.totalAmount), 0);
    const byStatus = STATUS_ORDER.map((status) => ({ status, count: list.filter((b) => b.status === status).length }));
    const durations = list.map((b) => money(b.duration)).filter((d) => d > 0);

    const perGuard = new Map<string, { jobs: number; earnings: number }>();
    completed.forEach((b) => {
      if (!b.guardId) return;
      const row = perGuard.get(b.guardId) ?? { jobs: 0, earnings: 0 };
      row.jobs += 1;
      row.earnings += money(b.guardPayout);
      perGuard.set(b.guardId, row);
    });
    const topGuards = Array.from(perGuard.entries())
      .sort((a, b) => b[1].jobs - a[1].jobs || b[1].earnings - a[1].earnings)
      .slice(0, 5);

    return {
      total: list.length,
      completed: completed.length,
      cancelled: cancelled.length,
      gross,
      platform: completed.reduce((s, b) => s + money(b.platformCut), 0),
      payouts: completed.reduce((s, b) => s + money(b.guardPayout), 0),
      fees: completed.reduce((s, b) => s + money(b.processingFee), 0),
      avgValue: completed.length ? gross / completed.length : null,
      avgDuration: durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
      avgRating: rated.length ? rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length : null,
      ratedCount: rated.length,
      byStatus,
      maxStatus: Math.max(1, ...byStatus.map((s) => s.count)),
      topGuards,
    };
  }, [bookings, range]);

  // Nombres solo de los escoltas del ranking.
  const topIds = data.topGuards.map(([id]) => id).join(',');
  useEffect(() => {
    if (!topIds) return;
    userService.getUsersByIds(topIds.split(',')).then(setGuardNames).catch(() => {});
  }, [topIds]);

  const rangeLabel = range === 'all' ? t('analytics.rangeAll') : t('analytics.rangeLast', { count: Number(range) });
  const oneDecimal = (n: number) => formatNumber(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <View style={styles.root}>
      <NavBar title={t('analytics.nav')} />
      <Screen
        padTop={false}
        contentStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        <View style={styles.header}>
          <AppText variant="title2">{t('analytics.title')}</AppText>
          <AppText variant="caption" color={Colors.textTertiary}>
            {loadedAt ? t('analytics.liveAsOf', { time: formatDateTime(loadedAt) }) : t('analytics.loadingLive')}
          </AppText>
        </View>

        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: t('shared.days', { count: 30 }) },
            { value: '90', label: t('shared.days', { count: 90 }) },
            { value: 'all', label: t('analytics.allTime') },
          ]}
        />

        {error ? (
          <Notice tone="error" message={t('analytics.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} style={styles.block} />
        ) : null}

        <SectionTitle title={t('analytics.bookingsSection', { range: rangeLabel })} />
        {bookings === null && !error ? (
          <View style={styles.grid}>
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
          </View>
        ) : bookings !== null && data.total === 0 ? (
          <EmptyState icon={CalendarCheck} title={t('analytics.emptyTitle')} message={t('analytics.emptyMessage')} />
        ) : bookings !== null ? (
          <>
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                <StatTile label={t('analytics.created')} value={data.total} icon={CalendarCheck} />
                <StatTile
                  label={t('analytics.completed')}
                  value={data.completed}
                  hint={t('analytics.ofCreated', { percent: percent(data.completed, data.total) })}
                  icon={CircleCheck}
                />
              </View>
              <View style={styles.grid}>
                <StatTile
                  label={t('analytics.cancelled')}
                  value={data.cancelled}
                  hint={t('analytics.ofCreated', { percent: percent(data.cancelled, data.total) })}
                  icon={Ban}
                />
                <StatTile
                  label={t('analytics.avgDuration')}
                  value={data.avgDuration !== null ? t('analytics.hours', { value: oneDecimal(data.avgDuration) }) : '—'}
                  icon={Clock}
                />
              </View>
            </View>

            <SectionTitle title={t('analytics.statusBreakdown')} />
            <Card style={styles.bars}>
              {data.byStatus.map(({ status, count }) => {
                const meta = bookingStatusMeta(status);
                return (
                  <View key={status} style={styles.barRow} accessibilityLabel={t('analytics.barA11y', { label: meta.label, count })}>
                    <AppText variant="footnote" numberOfLines={1} style={styles.barLabel}>
                      {meta.label}
                    </AppText>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${(count / data.maxStatus) * 100}%`, backgroundColor: TONE_COLOR[meta.tone] },
                        ]}
                      />
                    </View>
                    <AppText variant="numeric" style={styles.barValue}>
                      {count}
                    </AppText>
                  </View>
                );
              })}
            </Card>

            <SectionTitle title={t('analytics.moneySection')} />
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                <StatTile label={t('shared.clientPayments')} value={formatMXN(data.gross)} icon={Wallet} />
                <StatTile label={t('shared.platformFees')} value={formatMXN(data.platform)} icon={Receipt} accent />
              </View>
            </View>
            <Card style={styles.infoCard}>
              <InfoRow label={t('analytics.guardPayouts')} value={formatMXN(data.payouts)} />
              <InfoRow label={t('analytics.cardFees')} value={formatMXN(data.fees)} />
              <InfoRow label={t('analytics.avgValue')} value={data.avgValue !== null ? formatMXN(data.avgValue) : '—'} />
              <InfoRow
                label={t('analytics.avgRating')}
                value={
                  data.avgRating !== null
                    ? t('analytics.ratingValue', { rating: oneDecimal(data.avgRating), reviews: t('counts.reviews', { count: data.ratedCount }) })
                    : t('shared.noReviewsYet')
                }
                icon={Star}
              />
            </Card>

            {data.topGuards.length > 0 ? (
              <>
                <SectionTitle title={t('analytics.topGuards')} />
                <Card style={styles.infoCard}>
                  {data.topGuards.map(([id, row]) => (
                    <InfoRow
                      key={id}
                      label={guardNames[id] ? fullName(guardNames[id]) : t('people.guard')}
                      value={t('analytics.topGuardValue', { jobs: t('counts.jobs', { count: row.jobs }), amount: formatMXN(row.earnings) })}
                    />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        <SectionTitle title={t('analytics.membersSection')} />
        {membersError ? (
          <Notice tone="error" message={t('analytics.membersError')} actionLabel={t('common:actions.tryAgain')} onAction={load} />
        ) : !members ? (
          <SkeletonCard lines={3} />
        ) : (
          <>
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                <StatTile label={t('analytics.clients')} value={members.clients} />
                <StatTile label={t('analytics.guards')} value={members.guards} hint={t('analytics.guardsHint', { count: members.available })} />
              </View>
            </View>
            <Card style={styles.infoCard}>
              <InfoRow label={t('analytics.companies')} value={String(members.companies)} />
              <InfoRow label={t('analytics.guardsVerified')} value={`${members.verified} · ${percent(members.verified, members.guards)}`} />
              <InfoRow label={t('analytics.guardsPending')} value={String(members.pendingKyc)} />
              <InfoRow label={t('analytics.guardsRejected')} value={String(members.rejectedKyc)} />
              <InfoRow label={t('analytics.suspended')} value={String(members.suspended)} />
            </Card>
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
    gap: Space.xs,
    marginBottom: Space.lg,
  },
  block: {
    marginTop: Space.lg,
  },
  gridWrap: {
    gap: Space.md,
  },
  grid: {
    flexDirection: 'row',
    gap: Space.md,
  },
  bars: {
    gap: Space.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  barLabel: {
    width: 92,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  barValue: {
    width: 32,
    textAlign: 'right',
  },
  infoCard: {
    marginTop: Space.md,
    paddingVertical: Space.sm,
  },
});

// Getter: el mensaje se lee al dibujar el fallback, en el idioma activo.
export default withErrorBoundary(AdminAnalyticsRoute, {
  get fallbackMessage() {
    return i18n.t('backoffice:analytics.crash');
  },
});
