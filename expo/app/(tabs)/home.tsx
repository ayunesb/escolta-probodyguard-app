import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  List,
  Map as MapIcon,
  MapPin,
  SearchX,
  ShieldCheck,
  Star,
  Wallet,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { guardService, hasCompleteProfile, hasCoordinates } from '@/services/guardService';
import { bookingService } from '@/services/bookingService';
import type { Booking, Guard } from '@/types';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Shadow, Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Badge,
  Card,
  Chip,
  Divider,
  EmptyState,
  Screen,
  ScreenHeader,
  SectionTitle,
  SegmentedControl,
  SkeletonCard,
} from '@/components/ui';
import MapView, { Marker, PROVIDER_DEFAULT } from '@/components/MapView';
import { GuardCard } from '@/components/funnel/GuardCard';
import {
  bookingStart,
  describeBookingOptions,
  distanceKm,
  formatScheduled,
  guardDisplayName,
  hasRating,
  isVerified,
  languageName,
  todayEyebrow,
} from '@/components/funnel/format';
import { useSilentDeviceLocation } from '@/components/funnel/deviceLocation';
import { formatMXN } from '@/utils/pricing';

export default function HomeScreen() {
  const { user } = useAuth();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {user?.role === 'guard' ? <GuardJobsHome guardId={user.id} /> : <ClientRosterHome />}
    </>
  );
}

// =====================================================================
// Client: a curated roster of protectors
// =====================================================================

type Focus = 'all' | 'top' | 'nearby' | 'value';
type LoadState = 'loading' | 'ready' | 'error';

const TOP_RATED_MIN = 4.5;

// Recommended order: proven track record first, then experience, then name.
const byRecommendation = (a: Guard, b: Guard) =>
  Number(hasRating(b)) - Number(hasRating(a)) ||
  b.rating - a.rating ||
  b.completedJobs - a.completedJobs ||
  guardDisplayName(a).localeCompare(guardDisplayName(b));

function ClientRosterHome() {
  const router = useRouter();
  // Never prompts here: distances appear only if location was already allowed.
  const currentLocation = useSilentDeviceLocation();
  const [guards, setGuards] = useState<Guard[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [focus, setFocus] = useState<Focus>('all');
  const [language, setLanguage] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setState('loading');
    try {
      const list = await guardService.listAvailableGuards();
      // A profile without an hourly rate can't be priced or booked: hide it.
      setGuards(list.filter(hasCompleteProfile));
      setState('ready');
    } catch {
      setState('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real distance only when BOTH the client and the guard have real coordinates.
  const distances = useMemo(() => {
    const map = new Map<string, number>();
    if (!currentLocation) return map;
    for (const g of guards) {
      if (hasCoordinates(g)) map.set(g.id, distanceKm(currentLocation, g));
    }
    return map;
  }, [guards, currentLocation]);

  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of guards) for (const l of g.languages) counts.set(l, (counts.get(l) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [guards]);

  const visible = useMemo(() => {
    let list = language ? guards.filter((g) => g.languages.includes(language as Guard['languages'][number])) : guards;
    switch (focus) {
      case 'top':
        list = list.filter((g) => hasRating(g) && g.rating >= TOP_RATED_MIN).sort((a, b) => b.rating - a.rating || b.completedJobs - a.completedJobs);
        break;
      case 'nearby':
        list = list.filter((g) => distances.has(g.id)).sort((a, b) => distances.get(a.id)! - distances.get(b.id)!);
        break;
      case 'value':
        list = [...list].sort((a, b) => a.hourlyRate - b.hourlyRate);
        break;
      default:
        list = [...list].sort(byRecommendation);
    }
    return list;
  }, [guards, language, focus, distances]);

  const openGuard = (id: string) => router.push(`/guard/${id}`);
  const clearFilters = () => {
    setFocus('all');
    setLanguage(null);
  };

  const header = (
    <View>
      <ScreenHeader
        eyebrow={todayEyebrow()}
        title="Book protection"
        subtitle="Vetted close-protection professionals, ready when you are."
        right={
          <SegmentedControl
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'list', icon: List, accessibilityLabel: 'List view' },
              { value: 'map', icon: MapIcon, accessibilityLabel: 'Map view' },
            ]}
          />
        }
      />
      {state === 'ready' && guards.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
          <Chip label="All" count={guards.length} selected={focus === 'all' && !language} onPress={clearFilters} />
          <Chip label="Top rated" icon={Star} selected={focus === 'top'} onPress={() => setFocus(focus === 'top' ? 'all' : 'top')} />
          {distances.size > 0 ? (
            <Chip label="Nearby" icon={MapPin} selected={focus === 'nearby'} onPress={() => setFocus(focus === 'nearby' ? 'all' : 'nearby')} />
          ) : null}
          <Chip label="Best value" icon={Wallet} selected={focus === 'value'} onPress={() => setFocus(focus === 'value' ? 'all' : 'value')} />
          {languages.length > 1
            ? languages.map(([code, count]) => (
                <Chip
                  key={code}
                  label={languageName(code)}
                  count={count}
                  selected={language === code}
                  onPress={() => setLanguage(language === code ? null : code)}
                />
              ))
            : null}
        </ScrollView>
      ) : null}
      {state === 'ready' && guards.length > 0 && viewMode === 'list' ? (
        <SectionTitle title={`${visible.length} ${visible.length === 1 ? 'protector' : 'protectors'} available`} />
      ) : null}
    </View>
  );

  const statusView =
    state === 'loading' ? (
      <View style={styles.skeletons}>
        <SkeletonCard media />
        <SkeletonCard media />
        <SkeletonCard media />
      </View>
    ) : state === 'error' ? (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load protectors"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => load()}
      />
    ) : guards.length === 0 ? (
      <EmptyState
        icon={ShieldCheck}
        title="No protectors available right now"
        message="Every protector is identity-verified before they appear here. Pull down to refresh."
        actionLabel="Refresh"
        onAction={() => load()}
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title="No protectors match"
        message={focus === 'top' ? 'No one has a rating of 4.5 or higher yet.' : 'Try a different filter.'}
        actionLabel="Show everyone"
        onAction={clearFilters}
      />
    );

  if (viewMode === 'map' && state === 'ready' && guards.length > 0) {
    return (
      <Screen scroll={false} glow>
        <View style={styles.gutter}>{header}</View>
        <RosterMap guards={visible} clientLocation={currentLocation} distances={distances} onOpen={openGuard} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} glow>
      <FlatList
        data={state === 'ready' ? visible : []}
        keyExtractor={(g) => g.id}
        renderItem={({ item }) => (
          <GuardCard guard={item} distanceKm={distances.get(item.id)} onPress={() => openGuard(item.id)} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={statusView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.gold} colors={[Colors.gold]} />}
      />
    </Screen>
  );
}

// Map view. Only guards with REAL coordinates get a marker; the viewport is
// centred on the client, else on the guards, else on a default city.
function RosterMap({
  guards,
  clientLocation,
  distances,
  onOpen,
}: {
  guards: Guard[];
  clientLocation: { latitude: number; longitude: number } | null;
  distances: Map<string, number>;
  onOpen: (id: string) => void;
}) {
  const mapped = guards.filter(hasCoordinates);
  const center = clientLocation
    ? clientLocation
    : mapped.length > 0
      ? {
          latitude: mapped.reduce((s, g) => s + g.latitude, 0) / mapped.length,
          longitude: mapped.reduce((s, g) => s + g.longitude, 0) / mapped.length,
        }
      : { latitude: 20.6296, longitude: -87.0739 }; // Playa del Carmen: viewport only, not data

  return (
    <View style={styles.mapWrap}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...center, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        showsUserLocation={!!clientLocation}
      >
        {mapped.map((g) => (
          <Marker
            key={g.id}
            coordinate={{ latitude: g.latitude, longitude: g.longitude }}
            onPress={() => onOpen(g.id)}
            accessibilityLabel={guardDisplayName(g)}
          >
            <View style={styles.marker}>
              <Avatar name={`${g.firstName} ${g.lastName}`} uri={g.photos[0]} size={34} />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.mapOverlay} pointerEvents="box-none">
        {mapped.length === 0 ? (
          <Card tone="raised" style={styles.mapNote}>
            <AppText variant="callout" color={Colors.textPrimary}>
              No protector has shared a location yet.
            </AppText>
            <AppText variant="footnote">Switch to the list to see everyone available.</AppText>
          </Card>
        ) : (
          <FlatList
            horizontal
            data={mapped}
            keyExtractor={(g) => g.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mapCards}
            renderItem={({ item }) => (
              <Card
                onPress={() => onOpen(item.id)}
                tone="raised"
                style={styles.miniCard}
                accessibilityLabel={`${guardDisplayName(item)}, ${formatMXN(item.hourlyRate)} per hour`}
                accessibilityHint="Opens the profile to book protection"
              >
                <View style={styles.miniRow}>
                  <Avatar name={`${item.firstName} ${item.lastName}`} uri={item.photos[0]} size={44} verified={isVerified(item)} />
                  <View style={styles.flex}>
                    <AppText variant="title3" numberOfLines={1}>
                      {guardDisplayName(item)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
                      {hasRating(item) ? `${item.rating.toFixed(1)} rating · ` : ''}
                      {distances.has(item.id) ? `${distances.get(item.id)!.toFixed(1)} km` : item.languages.map(languageName).join(' · ')}
                    </AppText>
                  </View>
                  <AppText variant="numeric" color={Colors.goldLight}>
                    {formatMXN(item.hourlyRate)}
                  </AppText>
                </View>
              </Card>
            )}
          />
        )}
      </View>
    </View>
  );
}

// =====================================================================
// Guard: paid requests awaiting a response (live)
// =====================================================================

function GuardJobsHome({ guardId }: { guardId: string }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState('loading');
    setErrorMessage(null);
    const unsubscribe = bookingService.subscribeToGuardBookings(
      guardId,
      (bookings) => {
        // 'confirmed' = paid and waiting for this guard to accept. Never 'pending' (unpaid).
        const open = bookings
          .filter((b) => b.status === 'confirmed')
          .sort((a, b) => (bookingStart(a)?.getTime() ?? 0) - (bookingStart(b)?.getTime() ?? 0));
        setJobs(open);
        setState('ready');
      },
      (error) => {
        setErrorMessage(error.message);
        setState('error');
      }
    );
    return unsubscribe;
  }, [guardId, attempt]);

  const header = (
    <ScreenHeader
      eyebrow={todayEyebrow()}
      title="Available jobs"
      subtitle={
        state !== 'ready'
          ? 'Paid requests assigned to you appear here the moment they arrive.'
          : jobs.length === 0
            ? 'No open requests right now.'
            : `${jobs.length} paid ${jobs.length === 1 ? 'request is' : 'requests are'} waiting for your response.`
      }
    />
  );

  const statusView =
    state === 'loading' ? (
      <View style={styles.skeletons}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </View>
    ) : state === 'error' ? (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load your jobs"
        message={errorMessage ?? 'Check your connection and try again.'}
        actionLabel="Try again"
        onAction={() => setAttempt((n) => n + 1)}
      />
    ) : (
      <EmptyState
        icon={ShieldCheck}
        title="No jobs waiting"
        message="When a client books and pays for you, the request appears here instantly."
      />
    );

  return (
    <Screen scroll={false} glow>
      <FlatList
        data={state === 'ready' ? jobs : []}
        keyExtractor={(b) => b.id}
        ListHeaderComponent={header}
        ListEmptyComponent={statusView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: booking }) => (
          <Card
            onPress={() => router.push(`/booking/${booking.id}`)}
            style={styles.jobCard}
            accessibilityLabel={`New job, ${formatScheduled(booking)}, ${booking.duration} hours, payout ${formatMXN(booking.guardPayout)}`}
            accessibilityHint="Double tap to view job details and accept or reject"
          >
            <View style={styles.jobHead}>
              <Badge label="Awaiting your response" tone="info" />
              <AppText variant="caption" color={Colors.textTertiary} tabular>
                #{booking.id.slice(-6).toUpperCase()}
              </AppText>
            </View>

            <AppText variant="title3" style={styles.jobWhen}>
              {formatScheduled(booking)}
            </AppText>

            <View style={styles.jobLine}>
              <MapPin size={16} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
              <AppText variant="callout" numberOfLines={2} style={styles.flex}>
                {booking.pickupAddress || 'Pickup address on the booking'}
              </AppText>
            </View>
            <View style={styles.jobLine}>
              <Clock size={16} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
              <AppText variant="callout" style={styles.flex}>
                {describeBookingOptions(booking)}
              </AppText>
            </View>

            <Divider style={styles.jobDivider} />

            <View style={styles.jobFoot}>
              <View>
                <AppText variant="overline">Your payout</AppText>
                <AppText variant="numeric" color={Colors.goldLight} style={styles.payout}>
                  {formatMXN(booking.guardPayout)}
                </AppText>
              </View>
              <View style={styles.viewDetails}>
                <AppText variant="callout" color={Colors.textSecondary}>
                  View details
                </AppText>
                <ChevronRight size={16} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  gutter: {
    paddingHorizontal: Space.gutter,
  },
  listContent: {
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.huge,
    flexGrow: 1,
  },
  chipsScroll: {
    marginHorizontal: -Space.gutter,
    flexGrow: 0,
  },
  chips: {
    gap: Space.sm,
    paddingHorizontal: Space.gutter,
  },
  skeletons: {
    marginTop: Space.lg,
  },
  // ---- map
  mapWrap: {
    flex: 1,
    marginTop: Space.lg,
    overflow: 'hidden',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  marker: {
    padding: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    ...Shadow.md,
  },
  mapOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: Space.lg,
  },
  mapCards: {
    gap: Space.md,
    paddingHorizontal: Space.gutter,
  },
  miniCard: {
    width: 280,
    ...Shadow.lg,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  mapNote: {
    marginHorizontal: Space.gutter,
    gap: Space.xs,
    ...Shadow.lg,
  },
  // ---- guard jobs
  jobCard: {
    marginBottom: Space.md,
  },
  jobHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobWhen: {
    marginTop: Space.md,
    marginBottom: Space.sm,
  },
  jobLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    marginTop: Space.xs + 2,
  },
  jobDivider: {
    marginVertical: Space.lg,
  },
  jobFoot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  payout: {
    fontSize: 20,
    lineHeight: 26,
    marginTop: Space.xs,
  },
  viewDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
});
