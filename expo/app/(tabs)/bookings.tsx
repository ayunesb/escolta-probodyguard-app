import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertCircle, BriefcaseBusiness, CalendarDays, History } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { bookingService } from '@/services/bookingService';
import { Space } from '@/constants/design';
import { EmptyState, Screen, ScreenHeader, SegmentedControl, SkeletonCard } from '@/components/ui';
import { BookingCard } from '@/components/booking/BookingCard';
import { scheduledDate } from '@/components/booking/format';
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

const HEADER: Record<UserRole, { title: string; subtitle: string }> = {
  client: { title: 'Your bookings', subtitle: 'Every protection detail, upcoming and past.' },
  guard: { title: 'Your jobs', subtitle: 'Jobs you have accepted, are working, or have finished.' },
  company: { title: 'Team bookings', subtitle: 'Every job your protectors are handling.' },
  admin: { title: 'All bookings', subtitle: 'Bookings across the platform.' },
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
    bookings.forEach((b) => (upcomingStatuses.includes(b.status) ? up : done).push(b));
    up.sort((a, b) => {
      const la = LIVE_FIRST[a.status] ?? 9;
      const lb = LIVE_FIRST[b.status] ?? 9;
      return la !== lb ? la - lb : startTime(a) - startTime(b);
    });
    done.sort((a, b) => startTime(b) - startTime(a));
    return { upcoming: up, past: done };
  }, [bookings, role]);

  const data = segment === 'upcoming' ? upcoming : past;
  const header = HEADER[role];
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

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
          title="Couldn't load bookings"
          message={error}
          actionLabel="Try again"
          onAction={() => setAttempt((n) => n + 1)}
        />
      );
    }
    if (segment === 'past') {
      return (
        <EmptyState
          icon={History}
          title={role === 'guard' ? 'No finished jobs yet' : 'No past bookings yet'}
          message="Completed and cancelled bookings will appear here."
        />
      );
    }
    if (role === 'client') {
      return (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming bookings"
          message="When you book a protector, the details and live status appear here."
          actionLabel="Book protection"
          onAction={() => router.push('/(tabs)/home')}
        />
      );
    }
    if (role === 'guard') {
      return (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No upcoming jobs"
          message="New requests arrive on your Jobs tab. Accepted jobs show up here."
          actionLabel="See requests"
          onAction={() => router.push('/(tabs)/home')}
        />
      );
    }
    return <EmptyState icon={CalendarDays} title="No active bookings" message="Bookings in progress will appear here." />;
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
            <ScreenHeader eyebrow={today} title={header.title} subtitle={header.subtitle} />
            <SegmentedControl<Segment>
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'upcoming', label: `Upcoming${loading ? '' : ` · ${upcoming.length}`}`, accessibilityLabel: 'Upcoming bookings' },
                { value: 'past', label: `Past${loading ? '' : ` · ${past.length}`}`, accessibilityLabel: 'Past bookings' },
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
