import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  CalendarCheck,
  ChevronLeft,
  Clock,
  Languages,
  MessageCircle,
  Mic,
  Ruler,
  ShieldCheck,
  Star,
  TrendingUp,
  UserX,
  Weight,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { guardService, hasCompleteProfile } from '@/services/guardService';
import type { Guard } from '@/types';
import Colors from '@/constants/colors';
import { ICON_STROKE, MAX_CONTENT_WIDTH, Radius, Space } from '@/constants/design';
import {
  ActionBar,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  InfoRow,
  ListGroup,
  ListRow,
  Screen,
  Scrim,
  SectionTitle,
  Skeleton,
  StatTile,
} from '@/components/ui';
import { GuardPortrait } from '@/components/funnel/GuardPortrait';
import { guardDisplayName, hasRating, isVerified, languageName } from '@/components/funnel/format';
import { formatMXN } from '@/utils/pricing';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

export default function GuardDetailScreen() {
  const { t } = useTranslation(['funnel', 'common']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [guard, setGuard] = useState<Guard | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  // The portrait runs edge to edge of the (max 560 + gutters) column.
  const heroWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH + Space.gutter * 2);
  const heroHeight = Math.round(Math.min(520, Math.max(420, heroWidth * 1.17)));

  const load = useCallback(async () => {
    if (!id) {
      setState('missing');
      return;
    }
    setState('loading');
    try {
      const result = await guardService.getGuardById(id, { throwOnError: true });
      setGuard(result);
      setState(result ? 'ready' : 'missing');
    } catch {
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Same behaviour as NavBar's back button.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // No NavBar: the portrait owns the top of the screen and a floating glass
  // back button stays pinned above it (and above everything while scrolling).
  const shell = (content: React.ReactNode, footer?: React.ReactNode, withHero = false) => (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* First in the tree so it is first in focus order; zIndex keeps it on top. */}
      <View pointerEvents="box-none" style={[styles.floating, { top: insets.top + Space.sm }]}>
        <View pointerEvents="box-none" style={styles.floatingColumn}>
          <IconButton icon={ChevronLeft} onPress={goBack} accessibilityLabel={t('common:actions.goBack')} size={42} style={styles.backButton} />
        </View>
      </View>
      <Screen
        padTop={false}
        contentStyle={withHero ? null : { paddingTop: insets.top + Space.huge + Space.xxl }}
        footer={footer}
      >
        {content}
      </Screen>
    </View>
  );

  if (state === 'loading') {
    return shell(
      <View accessibilityLabel={t('profile.loading')}>
        <Skeleton height={heroHeight} radius={0} style={styles.heroSkeleton} />
        <View style={styles.statsRow}>
          <Skeleton height={96} radius={Radius.lg} style={styles.flex} />
          <Skeleton height={96} radius={Radius.lg} style={styles.flex} />
        </View>
        <Skeleton width="30%" height={11} style={styles.skeletonGap} />
        <Skeleton height={14} style={styles.skeletonLine} />
        <Skeleton width="70%" height={14} style={styles.skeletonLine} />
      </View>,
      undefined,
      true
    );
  }

  if (state === 'error') {
    return shell(
      <EmptyState
        icon={AlertTriangle}
        title={t('profile.errorTitle')}
        message={t('shared.checkConnection')}
        actionLabel={t('common:actions.tryAgain')}
        onAction={load}
      />
    );
  }

  if (state === 'missing' || !guard) {
    return shell(
      <EmptyState
        icon={UserX}
        title={t('profile.missingTitle')}
        message={t('profile.missingMessage')}
        actionLabel={t('shared.browseProtectors')}
        onAction={() => router.replace('/home')}
      />
    );
  }

  const name = guardDisplayName(guard);
  const verified = isVerified(guard);
  const rated = hasRating(guard);
  const priced = hasCompleteProfile(guard);
  const bookable = priced && verified && guard.availability;
  const unavailableReason = !priced
    ? t('profile.reasonNoRate', { name })
    : !verified
      ? t('profile.reasonVerifying', { name })
      : !guard.availability
        ? t('profile.reasonUnavailable', { name })
        : null;
  const gallery = guard.photos.slice(1);
  const breakdown = guard.ratingBreakdown;

  const footer = (
    <ActionBar>
      <View style={styles.actionRow}>
        <View style={styles.priceBlock}>
          <AppText variant="overline" numberOfLines={1}>
            {t('profile.hourlyRate')}
          </AppText>
          {priced ? (
            <AppText variant="numeric" color={Colors.accentLight} style={styles.price}>
              {formatMXN(guard.hourlyRate)}
            </AppText>
          ) : (
            <AppText variant="numeric" color={Colors.textTertiary} style={styles.price}>
              —
            </AppText>
          )}
        </View>
        <Button
          title={t('profile.book')}
          icon={ShieldCheck}
          size="lg"
          disabled={!bookable}
          onPress={() => router.push({ pathname: '/booking/create', params: { guardId: guard.id } })}
          style={styles.flex}
          accessibilityHint={unavailableReason ?? t('profile.bookHint')}
        />
      </View>
      {unavailableReason ? (
        <AppText variant="caption" color={Colors.textTertiary} style={styles.unavailable}>
          {unavailableReason}
        </AppText>
      ) : null}
    </ActionBar>
  );

  return shell(
    <>
      {/* Hero: the portrait, full bleed, name and standing laid over it */}
      <View style={[styles.hero, { height: heroHeight }]}>
        <GuardPortrait
          uri={guard.photos[0]}
          name={`${guard.firstName} ${guard.lastName}`}
          width={heroWidth}
          height={heroHeight}
          initialsSize={Math.round(heroHeight * 0.26)}
        />
        {/* Top shade keeps the status bar and back button legible on bright photos. */}
        <Scrim from="bottom" start={0.35} strength={0.75} style={styles.topShade} />
        <Scrim start={0.42} strength={0.97} />
        <View style={styles.heroBody}>
          <AppText variant="overline" color={Colors.accentLight}>
            {guard.isFreelancer ? t('profile.independent') : t('profile.agency')}
          </AppText>
          <AppText
            variant="display"
            color={Colors.white}
            accessibilityRole="header"
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {name}
          </AppText>
          <View style={styles.badges}>
            {verified ? <Badge label={t('profile.identityVerified')} tone="success" icon={BadgeCheck} /> : null}
            <Badge
              label={guard.availability ? t('profile.available') : t('shared.notTakingBookings')}
              tone={guard.availability ? 'success' : 'neutral'}
              icon={CalendarCheck}
            />
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatTile
          label={t('profile.rating')}
          icon={Star}
          value={rated ? guard.rating.toFixed(1) : '—'}
          hint={rated ? t('profile.outOf5') : t('profile.noReviews')}
        />
        <StatTile
          label={t('profile.completedJobs')}
          icon={ShieldCheck}
          value={guard.completedJobs}
          hint={guard.completedJobs === 0 ? t('shared.newToEscolta') : t('profile.onEscolta')}
        />
      </View>

      {gallery.length > 0 ? (
        <>
          <SectionTitle title={t('profile.portfolio')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {gallery.map((uri, idx) => (
              <Image
                key={`${uri}-${idx}`}
                source={{ uri }}
                style={styles.photo}
                accessibilityLabel={t('profile.photoA11y', { name, index: idx + 2 })}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {guard.bio.trim() ? (
        <>
          <SectionTitle title={t('profile.about')} />
          <AppText variant="body" color={Colors.textSecondary} style={styles.bio}>
            {guard.bio.trim()}
          </AppText>
        </>
      ) : null}

      {guard.languages.length > 0 ? (
        <>
          <SectionTitle title={t('profile.languages')} />
          <View style={styles.languages}>
            {guard.languages.map((code) => (
              <View key={code} style={styles.language}>
                <Languages size={14} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
                <AppText variant="callout" color={Colors.textPrimary}>
                  {languageName(code)}
                </AppText>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {guard.certifications.length > 0 ? (
        <>
          <SectionTitle title={t('profile.certifications')} />
          <ListGroup>
            {guard.certifications.map((cert, idx) => (
              <ListRow key={`${cert}-${idx}`} icon={Award} title={cert} />
            ))}
          </ListGroup>
        </>
      ) : null}

      {guard.height > 0 || guard.weight > 0 ? (
        <>
          <SectionTitle title={t('profile.physical')} />
          <Card>
            {guard.height > 0 ? <InfoRow label={t('profile.height')} icon={Ruler} value={`${guard.height} cm`} /> : null}
            {guard.weight > 0 ? <InfoRow label={t('profile.weight')} icon={Weight} value={`${guard.weight} kg`} /> : null}
          </Card>
        </>
      ) : null}

      {breakdown && rated ? (
        <>
          <SectionTitle title={t('profile.reviews')} />
          <Card>
            <RatingBar icon={TrendingUp} label={t('profile.professionalism')} value={breakdown.professionalism} />
            <RatingBar icon={Clock} label={t('profile.punctuality')} value={breakdown.punctuality} />
            <RatingBar icon={MessageCircle} label={t('profile.communication')} value={breakdown.communication} />
            <RatingBar icon={Mic} label={t('profile.languageClarity')} value={breakdown.languageClarity} />
          </Card>
        </>
      ) : null}
    </>,
    footer,
    true
  );
}

function RatingBar({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: number }) {
  const { t } = useTranslation('funnel');
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <View style={styles.ratingRow} accessible accessibilityLabel={t('profile.ratingA11y', { label, value: value.toFixed(1) })}>
      <View style={styles.ratingLabel}>
        <Icon size={16} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
        <AppText variant="callout">{label}</AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <AppText variant="numeric" style={styles.ratingValue}>
        {value.toFixed(1)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  // ---- floating back button (over the portrait, pinned while scrolling)
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Space.lg,
    zIndex: 10,
  },
  floatingColumn: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH + Space.gutter * 2,
    alignSelf: 'center',
    flexDirection: 'row',
  },
  // Dark glass so it reads over any photo and over text once scrolled.
  backButton: {
    backgroundColor: Colors.overlay,
    borderColor: Colors.glassBorder,
  },
  // ---- hero
  hero: {
    marginHorizontal: -Space.gutter,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  heroSkeleton: {
    marginHorizontal: -Space.gutter,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  topShade: {
    bottom: 'auto',
    height: 170,
  },
  heroBody: {
    paddingHorizontal: Space.gutter + Space.xs,
    paddingBottom: Space.xxl,
    gap: Space.sm,
  },
  skeletonGap: {
    marginTop: Space.xxl,
  },
  skeletonLine: {
    marginTop: Space.md,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.xl,
    alignSelf: 'stretch',
  },
  gallery: {
    gap: Space.md,
  },
  photo: {
    width: 132,
    height: 168,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceLight,
  },
  bio: {
    lineHeight: 24,
  },
  languages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  language: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md + 2,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glass,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  // Room for the longest Spanish label ("Claridad al hablar"); longer text wraps.
  ratingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    width: 164,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  ratingValue: {
    minWidth: 30,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  priceBlock: {
    minWidth: 110,
  },
  price: {
    fontSize: 20,
    lineHeight: 26,
    marginTop: 2,
  },
  unavailable: {
    marginTop: Space.sm,
  },
});
