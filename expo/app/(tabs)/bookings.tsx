import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AlertCircle, BriefcaseBusiness, CalendarDays, History } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { bookingService } from '@/services/bookingService';
import { Space } from '@/constants/design';
import { EmptyState, Screen, ScreenHeader, SegmentedControl, SkeletonCard } from '@/components/ui';
import { BookingCard } from '@/components/booking/BookingCard';
import { scheduledDate } from '@/components/booking/format';
import { capitalize, formatDate } from '@/i18n/format';
import type { Booking, BookingStatus, UserRole } from '@/types';

type Segment = 'upcoming' | 'past';

// Que cuenta como "proximo" para cada rol. El cliente ve aqui tambien lo que
// requiere accion suya (sin pagar, rechazada); el escolta nunca ve 'pending'.
const UPCOMING: Record<UserRole, BookingStatus[]> = {
  client: ['pending', 'confirmed', 'accepted', 'en_route', 'active', 'rejected'],
  guard: ['confirmed', 'accepted', 'en_route', 'active'],
  company: ['confirmed', 'accepted', 'en_route', 'active', 'rejected'],
  admin: ['pending', 'confirmed', 'accepted', 'en_route', 'active', 'rejected'],
};

const LIVE_FIRST: Partial<Record<BookingStatus, number>> = { active: 0, en_route: 1 };

const startTime = (b: Booking) => scheduledDate(b)?.getTime() ?? 0;

function subscribe(role: UserRole, userId: string, onData: (b: Booking[]) => void, onError: (e: Error) => void) {
  switch (role) {
    case 'guard':
      return bookingService.subscribeToGuardBookings(userId, onData, onError);
    case 'client':
      return bookingService.subscribeToClientBookings(userId, onData, onError);
    case 'company':
      return bookingService.subscribeToCompanyBookings(userId, onData, onError);
    default:
      return bookingService.subscribeToBookings(onData, onError);
  }
}

export default function BookingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation(['booking', 'common']);
  const role: UserRole = user?.role ?? 'client';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>('upcoming');
  const [attempt, setAttempt] = useState(0);
  const hasDataRef = useRef(false);

  // En vivo mientras la pestana esta enfocada; al volver se reusa la lista
  // anterior (sin esqueleto) mientras llega la nueva.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setBookings([]);
        setLoading(false);
        return;
      }
      if (!hasDataRef.current) setLoading(true);
      setError(null);
      return subscribe(
        user.role,
        user.id,
        (list) => {
          hasDataRef.current = true;
          setBookings(list);
          setError(null);
          setLoading(false);
        },
        (e) => {
          setError(e.message);
          setLoading(false);
        }
      );
      // `attempt` fuerza una nueva suscripcion al pulsar "Try again".
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, attempt])
  );

  const { upcoming, past } = useMemo(() => {
    const upcomingStatuses = UPCOMING[role];
    const up: Booking[] = [];
    const done: Booking[] = [];
    bookings.forEach((b) => (upcomingStatuses.includes(b.status) && b.paymentStatus !== 'refunded' ? up : done).push(b));
    up.sort((a, b) => {
      const la = LIVE_FIRST[a.status] ?? 9;
      const lb = LIVE_FIRST[b.status] ?? 9;
      return la !== lb ? la - lb : startTime(a) - startTime(b);
    });
    done.sort((a, b) => startTime(b) - startTime(a));
    return { upcoming: up, past: done };
  }, [bookings, role]);

  const data = segment === 'upcoming' ? upcoming : past;
  const today = capitalize(formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }));
  // El escolta ve "servicios" (masculino en espanol); el resto, "reservas".
  const jobs = role === 'guard';
  const segmentLabel = (label: string, count: number) =>
    loading ? label : t('booking:list.segments.withCount', { label, count });

  const openBooking = useCallback((id: string) => router.push(`/booking/${id}`), [router]);

  const renderEmpty = () => {
    if (loading) {
      return (
        <View>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      );
    }
    if (error) {
      return (
        <EmptyState
          icon={AlertCircle}
          title={t('booking:list.loadError')}
          message={error}
          actionLabel={t('common:actions.tryAgain')}
          onAction={() => setAttempt((n) => n + 1)}
        />
      );
    }
    if (segment === 'past') {
      return (
        <EmptyState
          icon={History}
          title={t(role === 'guard' ? 'booking:list.emptyPastJobs' : 'booking:list.emptyPast')}
          message={t('booking:list.emptyPastMessage')}
        />
      );
    }
    if (role === 'client') {
      return (
        <EmptyState
          icon={CalendarDays}
          title={t('booking:list.emptyClient')}
          message={t('booking:list.emptyClientMessage')}
          actionLabel={t('booking:list.bookProtection')}
          onAction={() => router.push('/(tabs)/home')}
        />
      );
    }
    if (role === 'guard') {
      return (
        <EmptyState
          icon={BriefcaseBusiness}
          title={t('booking:list.emptyGuard')}
          message={t('booking:list.emptyGuardMessage')}
          actionLabel={t('booking:list.seeRequests')}
          onAction={() => router.push('/(tabs)/home')}
        />
      );
    }
    return (
      <EmptyState
        icon={CalendarDays}
        title={t('booking:list.emptyOther')}
        message={t('booking:list.emptyOtherMessage')}
      />
    );
  };

  return (
    <Screen glow scroll={false}>
      <FlatList
        data={loading || error ? [] : data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <ScreenHeader
              eyebrow={today}
              title={t(`booking:list.headers.${role}.title`)}
              subtitle={t(`booking:list.headers.${role}.subtitle`)}
            />
            <SegmentedControl<Segment>
              value={segment}
              onChange={setSegment}
              options={[
                {
                  value: 'upcoming',
                  label: segmentLabel(t(jobs ? 'booking:list.segments.upcomingJobs' : 'booking:list.segments.upcoming'), upcoming.length),
                  accessibilityLabel: t(jobs ? 'booking:list.segments.upcomingJobsA11y' : 'booking:list.segments.upcomingA11y'),
                },
                {
                  value: 'past',
                  label: segmentLabel(t(jobs ? 'booking:list.segments.pastJobs' : 'booking:list.segments.past'), past.length),
                  accessibilityLabel: t(jobs ? 'booking:list.segments.pastJobsA11y' : 'booking:list.segments.pastA11y'),
                },
              ]}
              style={styles.segments}
            />
          </View>
        }
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            viewerRole={role}
            onPress={() => openBooking(item.id)}
            onTrack={role === 'client' || role === 'guard' ? () => router.push(`/tracking/${item.id}`) : undefined}
            onReassign={role === 'client' ? () => router.push(`/booking/select-guard?bookingId=${item.id}`) : undefined}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 1,
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.xxxl,
  },
  segments: {
    alignSelf: 'flex-start',
    marginBottom: Space.xl,
  },
});
