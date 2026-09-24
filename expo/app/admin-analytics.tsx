import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
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
import { Notice, RoleGate, bookingTime, fetchAllBookings, formatDateTime, fullName, money, percent, plural } from '@/components/backoffice';
import { withErrorBoundary } from '@/components/CriticalScreenErrorBoundary';
import { UserRecord, userService } from '@/services/userService';
import type { Booking, BookingStatus } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

type Range = '30' | '90' | 'all';

const TONE_COLOR: Record<Tone, string> = {
  neutral: Colors.textSecondary,
  gold: Colors.gold,
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
  const [range, setRange] = useState<Range>('30');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [members, setMembers] = useState<MemberCounts | null>(null);
  const [guardNames, setGuardNames] = useState<Record<string, UserRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  // Lecturas de una sola vez (sin listeners): reservas de RTDB y conteos de
  // usuarios en el servidor de Firestore.
  const load = useCallback(async () => {
    setError(null);
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
      setError('Bookings could not be loaded.');
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

  const rangeLabel = range === 'all' ? 'all time' : `last ${range} days`;

  return (
    <View style={styles.root}>
      <NavBar title="Analytics" />
      <Screen
        padTop={false}
        contentStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        <View style={styles.header}>
          <AppText variant="title2">Platform analytics</AppText>
          <AppText variant="caption" color={Colors.textTertiary}>
            {loadedAt ? `Live data as of ${formatDateTime(loadedAt)} · pull to refresh` : 'Loading live data…'}
          </AppText>
        </View>

        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
            { value: 'all', label: 'All time' },
          ]}
        />

        {error ? <Notice tone="error" message={error} actionLabel="Try again" onAction={load} style={styles.block} /> : null}

        <SectionTitle title={`Bookings · ${rangeLabel}`} />
        {bookings === null && !error ? (
          <View style={styles.grid}>
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
          </View>
        ) : bookings !== null && data.total === 0 ? (
          <EmptyState icon={CalendarCheck} title="No bookings in this period" message="Try a longer range." />
        ) : bookings !== null ? (
          <>
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                <StatTile label="Created" value={data.total} icon={CalendarCheck} />
                <StatTile label="Completed" value={data.completed} hint={`${percent(data.completed, data.total)} of created`} icon={CircleCheck} />
              </View>
              <View style={styles.grid}>
                <StatTile label="Cancelled" value={data.cancelled} hint={`${percent(data.cancelled, data.total)} of created`} icon={Ban} />
                <StatTile
                  label="Avg duration"
                  value={data.avgDuration !== null ? `${data.avgDuration.toFixed(1)} h` : '—'}
                  icon={Clock}
                />
              </View>
            </View>

            <SectionTitle title="Status breakdown" />
            <Card style={styles.bars}>
              {data.byStatus.map(({ status, count }) => {
                const meta = bookingStatusMeta(status);
                return (
                  <View key={status} style={styles.barRow} accessibilityLabel={`${meta.label}: ${count}`}>
                    <AppText variant="footnote" style={styles.barLabel}>
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

            <SectionTitle title="Money · completed jobs" />
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                <StatTile label="Client payments" value={formatMXN(data.gross)} icon={Wallet} />
                <StatTile label="Platform fees" value={formatMXN(data.platform)} icon={Receipt} accent />
              </View>
            </View>
            <Card style={styles.infoCard}>
              <InfoRow label="Guard payouts" value={formatMXN(data.payouts)} />
              <InfoRow label="Card processing fees" value={formatMXN(data.fees)} />
              <InfoRow label="Average booking value" value={data.avgValue !== null ? formatMXN(data.avgValue) : '—'} />
              <InfoRow
                label="Average rating"
                value={data.avgRating !== null ? `${data.avgRating.toFixed(1)} · ${plural(data.ratedCount, 'review')}` : 'No reviews yet'}
                icon={Star}
              />
            </Card>

            {data.topGuards.length > 0 ? (
              <>
                <SectionTitle title="Most booked guards" />
                <Card style={styles.infoCard}>
                  {data.topGuards.map(([id, row]) => (
                    <InfoRow
                      key={id}
                      label={guardNames[id] ? fullName(guardNames[id]) : 'Guard'}
                      value={`${plural(row.jobs, 'job')} · ${formatMXN(row.earnings)}`}
                    />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        <SectionTitle title="Members · all time" />
        {membersError ? (
          <Notice tone="error" message="Member counts could not be loaded." actionLabel="Try again" onAction={load} />
        ) : !members ? (
          <SkeletonCard lines={3} />
        ) : (
          <>
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                <StatTile label="Clients" value={members.clients} />
                <StatTile label="Guards" value={members.guards} hint={`${members.available} available now`} />
              </View>
            </View>
            <Card style={styles.infoCard}>
              <InfoRow label="Security companies" value={String(members.companies)} />
              <InfoRow label="Guards verified" value={`${members.verified} · ${percent(members.verified, members.guards)}`} />
              <InfoRow label="Guards pending verification" value={String(members.pendingKyc)} />
              <InfoRow label="Guards rejected" value={String(members.rejectedKyc)} />
              <InfoRow label="Suspended accounts" value={String(members.suspended)} />
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

export default withErrorBoundary(AdminAnalyticsRoute, {
  fallbackMessage: 'Analytics could not be displayed. Please try again.',
});
