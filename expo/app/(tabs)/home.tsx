import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, RefreshControl, ScrollView, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowDown,
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
import { Fonts, ICON_STROKE, MAX_CONTENT_WIDTH, Radius, Shadow, Space } from '@/constants/design';
import { BrandImages, SERVICE_MOMENTS } from '@/constants/brandMedia';
import {
  AppText,
  Avatar,
  Badge,
  BrandMark,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  PhotoCard,
  Screen,
  ScreenHeader,
  Scrim,
  SegmentedControl,
  Skeleton,
  SkeletonCard,
} from '@/components/ui';
import MapView, { Marker, PROVIDER_DEFAULT } from '@/components/MapView';
import { GuardPhotoCard } from '@/components/funnel/GuardPhotoCard';
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
      {user?.role === 'guard' ? <GuardJobsHome guardId={user.id} /> : <ClientRosterHome firstName={user?.firstName} />}
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

// hero-door.jpg is 4:5 and the protector's face sits ~25% down the frame.
const HERO_ASPECT = 960 / 1200;
const HERO_FACE_Y = 0.25;
const MOMENT_WIDTH = 220;
const MOMENT_HEIGHT = 280;

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 19) return 'Good afternoon';
  return 'Good evening';
}

function ClientRosterHome({ firstName }: { firstName?: string }) {
  const router = useRouter();
  // Never prompts here: distances appear only if location was already allowed.
  const currentLocation = useSilentDeviceLocation();
  const [guards, setGuards] = useState<Guard[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [focus, setFocus] = useState<Focus>('all');
  const [language, setLanguage] = useState<string | null>(null);
  const listRef = useRef<FlatList<Guard>>(null);
  const rosterY = useRef(0);

  // Sizes derive from the content column once, so every photo has a fixed frame.
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH) - Space.gutter * 2;
  const heroHeight = contentWidth >= 440 ? 380 : 340;
  const cardHeight = Math.round(Math.min(440, Math.max(340, contentWidth * 1.08)));

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

  const openGuard = useCallback((id: string) => router.push(`/guard/${id}`), [router]);
  const clearFilters = () => {
    setFocus('all');
    setLanguage(null);
  };

  // "Find a protector": glide down to the roster heading.
  const scrollToRoster = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: Math.max(0, rosterY.current - Space.sm), animated: true });
  }, []);

  const name = firstName?.trim();
  const greeting = (
    <View style={styles.greetingRow}>
      <AppText variant="title3" color={Colors.textSecondary} numberOfLines={1} style={styles.flex}>
        {greetingFor()}
        {name ? ', ' : ''}
        {name ? (
          <AppText variant="title3" color={Colors.textPrimary}>
            {name}
          </AppText>
        ) : null}
      </AppText>
      <BrandMark size={28} />
    </View>
  );

  const rosterEyebrow =
    state === 'ready' && guards.length > 0 ? `${visible.length} ${visible.length === 1 ? 'protector' : 'protectors'}` : 'Protectors';

  const rosterHead = (
    <View
      onLayout={(e) => {
        rosterY.current = e.nativeEvent.layout.y;
      }}
    >
      <SectionHeading
        eyebrow={rosterEyebrow}
        title="Available now"
        style={viewMode === 'map' ? styles.headingCompact : undefined}
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.bleed}>
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
    </View>
  );

  const header = (
    <View>
      {greeting}
      <HeroCard width={contentWidth} height={heroHeight} onFind={scrollToRoster} />

      <SectionHeading eyebrow="Protection" title="For every moment" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={MOMENT_WIDTH + Space.md}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={styles.moments}
        style={styles.bleed}
      >
        {SERVICE_MOMENTS.map((moment) => (
          <PhotoCard
            key={moment.key}
            image={moment.image}
            title={moment.title}
            caption={moment.caption}
            width={MOMENT_WIDTH}
            height={MOMENT_HEIGHT}
            accessibilityLabel={`${moment.title}. ${moment.caption}`}
          />
        ))}
      </ScrollView>

      {rosterHead}
    </View>
  );

  const statusView =
    state === 'loading' ? (
      <View accessibilityLabel="Loading protectors">
        <Skeleton height={cardHeight} radius={Radius.lg} style={styles.skeletonCard} />
        <Skeleton height={cardHeight} radius={Radius.lg} style={styles.skeletonCard} />
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

  const renderGuard = useCallback(
    ({ item }: { item: Guard }) => (
      <GuardPhotoCard guard={item} distanceKm={distances.get(item.id)} width={contentWidth} height={cardHeight} onPress={openGuard} />
    ),
    [distances, contentWidth, cardHeight, openGuard]
  );

  if (viewMode === 'map' && state === 'ready' && guards.length > 0) {
    return (
      <Screen scroll={false} glow>
        <View style={styles.gutter}>
          {greeting}
          {rosterHead}
        </View>
        <RosterMap guards={visible} clientLocation={currentLocation} distances={distances} onOpen={openGuard} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} glow>
      <FlatList
        ref={listRef}
        data={state === 'ready' ? visible : []}
        keyExtractor={(g) => g.id}
        renderItem={renderGuard}
        ListHeaderComponent={header}
        ListEmptyComponent={statusView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.accent} colors={[Colors.accent]} />}
      />
    </Screen>
  );
}

// Opening photograph. The image is laid out at its own 4:5 ratio and shifted
// so the protector's face stays in the clear top band at any column width;
// the copy and the white pill sit on the scrim below it.
function HeroCard({ width, height, onFind }: { width: number; height: number; onFind: () => void }) {
  const imageHeight = width / HERO_ASPECT;
  const faceTarget = height * 0.17;
  const top = Math.min(0, Math.max(height - imageHeight, faceTarget - HERO_FACE_Y * imageHeight));
  return (
    <View style={[styles.hero, { height }]}>
      <Image
        source={BrandImages.heroDoor}
        style={[styles.heroImage, { top, height: imageHeight }]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <Scrim start={0.3} strength={0.96} />
      <View style={styles.heroBody}>
        <AppText variant="overline" color={Colors.accentLight}>
          {todayEyebrow()}
        </AppText>
        <AppText variant="display" color={Colors.white} accessibilityRole="header" style={styles.heroTitle}>
          Protection,{'\n'}
          <AppText variant="display" color={Colors.accentLight} style={styles.heroAccent}>
            on demand.
          </AppText>
        </AppText>
        <AppText variant="callout" color={Colors.textSecondary} numberOfLines={2}>
          Vetted protectors, ready when you are.
        </AppText>
        <Button
          title="Find a protector"
          iconRight={ArrowDown}
          fullWidth={false}
          onPress={onFind}
          accessibilityHint="Scrolls to the protectors available now"
          style={styles.heroButton}
        />
      </View>
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  right,
  style,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeading, style]}>
      <View style={styles.flex}>
        <AppText variant="overline" color={Colors.accent}>
          {eyebrow}
        </AppText>
        <AppText variant="title2" accessibilityRole="header" numberOfLines={1} style={styles.sectionTitle}>
          {title}
        </AppText>
      </View>
      {right}
    </View>
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
                  <AppText variant="numeric" color={Colors.accentLight}>
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
                <AppText variant="numeric" color={Colors.accentLight} style={styles.payout}>
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
  // Horizontal rails run edge to edge of the column.
  bleed: {
    marginHorizontal: -Space.gutter,
    flexGrow: 0,
  },
  chips: {
    gap: Space.sm,
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.lg,
  },
  skeletons: {
    marginTop: Space.lg,
  },
  skeletonCard: {
    marginBottom: Space.lg,
  },
  // ---- client home
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginBottom: Space.lg,
  },
  hero: {
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    justifyContent: 'flex-end',
    ...Shadow.md,
  },
  // Explicit width: on web an absolutely-positioned bundled image without one
  // falls back to its intrinsic pixel size instead of the card's width.
  heroImage: {
    position: 'absolute',
    left: 0,
    width: '100%',
  },
  heroBody: {
    padding: Space.xl,
    gap: Space.sm,
  },
  heroTitle: {
    marginTop: Space.xs,
  },
  heroAccent: {
    fontFamily: Fonts.displayLight,
  },
  heroButton: {
    marginTop: Space.sm,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.lg,
    marginTop: Space.xxxl,
    marginBottom: Space.lg,
  },
  headingCompact: {
    marginTop: Space.xs,
  },
  sectionTitle: {
    marginTop: Space.xs,
  },
  moments: {
    gap: Space.md,
    paddingHorizontal: Space.gutter,
  },
  // ---- map
  mapWrap: {
    flex: 1,
    marginTop: Space.xs,
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
    borderColor: Colors.accent,
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
