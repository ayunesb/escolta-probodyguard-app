import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { ACTIVE_STATUSES, Notice, RoleGate, formatDate, fullName, money, shortId, todayEyebrow } from '@/components/backoffice';
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
  const { t } = useTranslation(['backoffice', 'common']);
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
        title={company?.companyName || t('companyHome.titleFallback')}
        subtitle={t('companyHome.subtitle')}
      />

      <PhotoCard
        image={BrandImages.cityAerial}
        eyebrow={t('companyHome.bannerEyebrow')}
        title={t('companyHome.bannerTitle')}
        caption={t('companyHome.bannerCaption')}
        height={190}
        style={{ marginBottom: Space.xl }}
      />

      {guardsError ? (
        <Notice
          tone="error"
          message={t('companyHome.guardsError')}
          actionLabel={t('common:actions.tryAgain')}
          onAction={loadGuards}
          style={styles.block}
        />
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
            <StatTile
              label={t('companyHome.statGuards')}
              value={guards?.length ?? 0}
              hint={t('companyHome.statGuardsHint', { count: available })}
              icon={Users}
            />
            <StatTile
              label={t('companyHome.statActive')}
              value={stats.activeJobs}
              hint={t('companyHome.statActiveHint', { count: stats.upcoming })}
              icon={Briefcase}
            />
          </View>
          <View style={styles.grid}>
            <StatTile
              label={t('companyHome.statEarnings')}
              value={formatMXN(stats.guardEarnings)}
              hint={t('companyHome.statEarningsHint', { count: stats.completed })}
              icon={Wallet}
              accent
            />
            <StatTile
              label={t('companyHome.statRating')}
              value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
              hint={stats.ratedCount > 0 ? t('counts.reviews', { count: stats.ratedCount }) : t('shared.noReviewsYet')}
              icon={Star}
            />
          </View>
        </View>
      )}

      <SectionTitle title={t('companyHome.yourGuards')} />
      {guards === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : guards.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={t('companyHome.emptyGuardsTitle')}
          message={t('companyHome.emptyGuardsMessage')}
          actionLabel={t('companyHome.addGuards')}
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
                accessibilityLabel={t('companyHome.openDocuments', { name })}
                style={styles.row}
              >
                <Avatar name={name} uri={g.photos?.[0]} size={44} verified={g.kycStatus === 'approved'} />
                <View style={styles.flex}>
                  <AppText variant="headline" numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText variant="caption" color={Colors.textTertiary}>
                    {[active > 0 ? t('companyHome.activeCount', { count: active }) : null, t('counts.completedJobs', { count: done })]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                </View>
                <Badge
                  label={g.availability === true ? t('shared.available') : t('shared.offline')}
                  tone={g.availability === true ? 'success' : 'neutral'}
                  style={styles.badgeCenter}
                />
              </Card>
            );
          })}
          {guards.length > 6 ? (
            <Card onPress={() => router.push('/(tabs)/company-guards')} accessibilityLabel={t('companyHome.seeAllA11y')} style={styles.row}>
              <UserPlus size={18} color={Colors.accent} />
              <AppText variant="bodyMedium" style={styles.flex}>
                {t('companyHome.seeAll', { count: guards.length })}
              </AppText>
            </Card>
          ) : null}
        </View>
      )}

      <SectionTitle title={t('companyHome.recentBookings')} />
      {bookingsError ? (
        // El mensaje del servicio viene en ingles: se muestra el traducido.
        <Notice
          tone="error"
          message={t('companyHome.bookingsError')}
          actionLabel={t('common:actions.tryAgain')}
          onAction={onRefresh}
          style={styles.block}
        />
      ) : null}
      {bookings === null ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={t('companyHome.emptyBookingsTitle')}
          message={t('companyHome.emptyBookingsMessage')}
        />
      ) : (
        <View style={styles.list}>
          {bookings.slice(0, 6).map((b) => {
            const guard = b.guardId ? guardsById[b.guardId] : undefined;
            return (
              <Card key={b.id} style={styles.bookingCard}>
                <View style={styles.rowHead}>
                  <AppText variant="headline" style={styles.flex} numberOfLines={1}>
                    {guard ? fullName(guard) : t('people.guard')}
                  </AppText>
                  <StatusBadge status={b.status} />
                </View>
                <View style={styles.rowHead}>
                  {/* Dos renglones fijos (id y fecha / hora y duracion): en una sola
                      linea el texto se partia en cualquier punto, p. ej. "4 / h". */}
                  <View style={styles.flex}>
                    <AppText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
                      {`${shortId(b.id)} · ${formatDate(b.scheduledDate)}`}
                    </AppText>
                    {b.scheduledTime || b.duration ? (
                      <AppText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
                        {[b.scheduledTime || null, b.duration ? t('common:units.hoursShort', { count: b.duration }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </AppText>
                    ) : null}
                  </View>
                  <View style={styles.amount}>
                    <AppText variant="numeric" color={Colors.accentLight}>
                      {formatMXN(b.guardPayout)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textTertiary}>
                      {t('companyHome.guardEarnings')}
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
  // Badge trae alignSelf: 'flex-start'; en una fila centrada se ve subido.
  badgeCenter: {
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
});
