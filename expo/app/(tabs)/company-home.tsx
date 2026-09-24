import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Briefcase, CalendarCheck, Shield, Star, UserPlus, Users, Wallet } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Badge,
  Card,
  EmptyState,
  Screen,
  ScreenHeader,
  SectionTitle,
  SkeletonCard,
  StatTile,
  StatusBadge,
  PhotoCard,
} from '@/components/ui';
import { BrandImages } from '@/constants/brandMedia';
import { ACTIVE_STATUSES, Notice, RoleGate, formatDate, fullName, money, plural, shortId, todayEyebrow } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { bookingService } from '@/services/bookingService';
import { UserRecord, userService } from '@/services/userService';
import type { Booking } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

export default function CompanyHomeRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['company']}>
        <CompanyHomeScreen />
      </RoleGate>
    </>
  );
}

function CompanyHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const company = user as UserRecord | null;
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [guards, setGuards] = useState<UserRecord[] | null>(null);
  const [guardsError, setGuardsError] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadGuards = useCallback(async () => {
    if (!company) return;
    setGuardsError(false);
    try {
      const list = await userService.fetchGuardsForCompany(company.id);
      list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
      setGuards(list);
    } catch (error) {
      logger.error('[CompanyHome] Failed to load guards', error);
      setGuardsError(true);
      setGuards([]);
    }
  }, [company]);

  useFocusEffect(
    useCallback(() => {
      if (!company) return;
      loadGuards();
      // Reservas de la empresa: se componen desde el guardBookingIndex de
      // cada escolta (las reglas no dejan a una empresa leer /bookings
      // completo).
      setBookingsError(null);
      const unsubscribe = bookingService.subscribeToCompanyBookings(
        company.id,
        (list) => {
          setBookingsError(null);
          setBookings(list);
        },
        (error) => {
          setBookingsError(error.message);
          setBookings((prev) => prev ?? []);
        }
      );
      return () => unsubscribe();
      // reloadKey fuerza a reabrir la suscripcion al tirar hacia abajo
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [company, loadGuards, reloadKey])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    await loadGuards();
    setRefreshing(false);
  };

  const stats = useMemo(() => {
    const list = bookings ?? [];
    const completed = list.filter((b) => b.status === 'completed');
    const rated = completed.filter((b) => typeof b.rating === 'number' && b.rating > 0);
    return {
      activeJobs: list.filter((b) => ACTIVE_STATUSES.includes(b.status)).length,
      upcoming: list.filter((b) => b.status === 'confirmed').length,
      completed: completed.length,
      // Lo que ganan los escoltas en trabajos completados (no es ingreso de
      // la empresa ni de la plataforma).
      guardEarnings: completed.reduce((s, b) => s + money(b.guardPayout), 0),
      avgRating: rated.length > 0 ? rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length : null,
      ratedCount: rated.length,
    };
  }, [bookings]);

  const available = (guards ?? []).filter((g) => g.availability === true).length;
  const guardsById = useMemo(() => Object.fromEntries((guards ?? []).map((g) => [g.id, g])), [guards]);
  const loading = guards === null || bookings === null;

  return (
    <Screen glow refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>
      <ScreenHeader
        eyebrow={todayEyebrow()}
        title={company?.companyName || 'Your company'}
        subtitle="Your team, their jobs and their earnings."
      />

      <PhotoCard
        image={BrandImages.cityAerial}
        eyebrow="Your operation"
        title="Your roster, on call across the city"
        caption="Availability, jobs and earnings for every protector."
        height={190}
        style={{ marginBottom: Space.xl }}
      />

      {guardsError ? (
        <Notice tone="error" message="We could not load your guards." actionLabel="Try again" onAction={loadGuards} style={styles.block} />
      ) : null}

      {loading ? (
        <View style={styles.gridWrap}>
          <View style={styles.grid}>
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
          </View>
        </View>
      ) : (
        <View style={styles.gridWrap}>
          <View style={styles.grid}>
            <StatTile label="Guards" value={guards?.length ?? 0} hint={`${available} available now`} icon={Users} />
            <StatTile label="Active jobs" value={stats.activeJobs} hint={`${stats.upcoming} confirmed, not started`} icon={Briefcase} />
          </View>
          <View style={styles.grid}>
            <StatTile
              label="Guard earnings"
              value={formatMXN(stats.guardEarnings)}
              hint={`${plural(stats.completed, 'completed job')}`}
              icon={Wallet}
              accent
            />
            <StatTile
              label="Avg rating"
              value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
              hint={stats.ratedCount > 0 ? `${plural(stats.ratedCount, 'review')}` : 'No reviews yet'}
              icon={Star}
            />
          </View>
        </View>
      )}

      <SectionTitle title="Your guards" />
      {guards === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : guards.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No guards yet"
          message="Add your security professionals to start receiving bookings."
          actionLabel="Add guards"
          onAction={() => router.push('/(tabs)/company-guards')}
        />
      ) : (
        <View style={styles.list}>
          {guards.slice(0, 6).map((g) => {
            const name = fullName(g);
            const mine = (bookings ?? []).filter((b) => b.guardId === g.id);
            const active = mine.filter((b) => ACTIVE_STATUSES.includes(b.status)).length;
            const done = mine.filter((b) => b.status === 'completed').length;
            return (
              <Card
                key={g.id}
                onPress={() => router.push(`/company-guard-documents/${g.id}`)}
                accessibilityLabel={`${name}, open documents`}
                style={styles.row}
              >
                <Avatar name={name} uri={g.photos?.[0]} size={44} verified={g.kycStatus === 'approved'} />
                <View style={styles.flex}>
                  <AppText variant="headline" numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText variant="caption" color={Colors.textTertiary}>
                    {active > 0 ? `${active} active · ` : ''}
                    {plural(done, 'completed job')}
                  </AppText>
                </View>
                <Badge label={g.availability === true ? 'Available' : 'Offline'} tone={g.availability === true ? 'success' : 'neutral'} />
              </Card>
            );
          })}
          {guards.length > 6 ? (
            <Card onPress={() => router.push('/(tabs)/company-guards')} accessibilityLabel="See all guards" style={styles.row}>
              <UserPlus size={18} color={Colors.accent} />
              <AppText variant="bodyMedium" style={styles.flex}>
                See all {guards.length} guards
              </AppText>
            </Card>
          ) : null}
        </View>
      )}

      <SectionTitle title="Recent bookings" />
      {bookingsError ? (
        <Notice tone="error" message={bookingsError} actionLabel="Try again" onAction={onRefresh} style={styles.block} />
      ) : null}
      {bookings === null ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : bookings.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No bookings yet" message="Jobs assigned to your guards will appear here." />
      ) : (
        <View style={styles.list}>
          {bookings.slice(0, 6).map((b) => {
            const guard = b.guardId ? guardsById[b.guardId] : undefined;
            return (
              <Card key={b.id} style={styles.bookingCard}>
                <View style={styles.rowHead}>
                  <AppText variant="headline" style={styles.flex} numberOfLines={1}>
                    {guard ? fullName(guard) : 'Guard'}
                  </AppText>
                  <StatusBadge status={b.status} />
                </View>
                <View style={styles.rowHead}>
                  <AppText variant="caption" color={Colors.textTertiary} style={styles.flex}>
                    {shortId(b.id)} · {formatDate(b.scheduledDate)}
                    {b.scheduledTime ? ` · ${b.scheduledTime}` : ''}
                    {b.duration ? ` · ${b.duration} h` : ''}
                  </AppText>
                  <View style={styles.amount}>
                    <AppText variant="numeric" color={Colors.accentLight}>
                      {formatMXN(b.guardPayout)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textTertiary}>
                      guard earnings
                    </AppText>
                  </View>
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
    marginBottom: Space.lg,
  },
  gridWrap: {
    gap: Space.md,
  },
  grid: {
    flexDirection: 'row',
    gap: Space.md,
  },
  list: {
    gap: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  bookingCard: {
    gap: Space.sm,
  },
  amount: {
    alignItems: 'flex-end',
  },
  flex: {
    flex: 1,
  },
});
