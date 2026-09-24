import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, CheckCircle2, Hourglass, SearchX } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import {
  ActionBar,
  AppText,
  Avatar,
  Button,
  Card,
  EmptyState,
  Input,
  NavBar,
  Screen,
  SectionTitle,
  Skeleton,
  SkeletonCard,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { bookingService } from '@/services/bookingService';
import { StarRating } from '@/components/booking/StarRating';
import { guardDisplayName, useGuardProfile, useLiveBooking } from '@/components/booking/hooks';
import { formatLongDate } from '@/components/booking/format';
import type { RatingBreakdown } from '@/types';

const CATEGORIES: { key: keyof RatingBreakdown; label: string; hint: string }[] = [
  { key: 'professionalism', label: 'Professionalism', hint: 'Presence, discretion, conduct' },
  { key: 'punctuality', label: 'Punctuality', hint: 'On time for pickup and every stop' },
  { key: 'communication', label: 'Communication', hint: 'Clear, timely updates' },
  { key: 'languageClarity', label: 'Language', hint: 'Easy to understand' },
];

const VERDICT = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

const EMPTY_BREAKDOWN: RatingBreakdown = { professionalism: 0, punctuality: 0, communication: 0, languageClarity: 0 };

export default function RateBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { booking, loading, error, notFound, retry } = useLiveBooking(id);
  const { guard } = useGuardProfile(booking?.guardId);

  const [overall, setOverall] = useState(0);
  const [breakdown, setBreakdown] = useState<RatingBreakdown>(EMPTY_BREAKDOWN);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Tras enviar, la reserva en vivo ya trae la calificacion: sin esto la
  // pantalla parpadearia a "ya calificaste" antes de volver.
  const submittedRef = useRef(false);

  const backToBooking = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/booking/${id}`);
  };

  const name = guardDisplayName(guard);

  const renderState = () => {
    if (loading) {
      return (
        <View accessibilityLabel="Loading booking">
          <View style={styles.center}>
            <Skeleton width={72} height={72} radius={22} />
            <Skeleton width={160} height={16} style={styles.skelGap} />
          </View>
          <View style={styles.skelCards}>
            <SkeletonCard lines={1} />
            <SkeletonCard lines={4} />
          </View>
        </View>
      );
    }
    if (error) {
      return <EmptyState icon={AlertCircle} title="Couldn't load this booking" message={error} actionLabel="Try again" onAction={retry} />;
    }
    if (notFound || !booking) {
      return (
        <EmptyState
          icon={SearchX}
          title="Booking unavailable"
          message="It may have been removed, or you don't have access to it."
          actionLabel="Go back"
          onAction={backToBooking}
        />
      );
    }
    if (!user || booking.clientId !== user.id) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="Only the client can rate"
          message="Ratings come from the person who booked the service."
          actionLabel="Back to booking"
          onAction={backToBooking}
        />
      );
    }
    if (booking.status !== 'completed') {
      return (
        <EmptyState
          icon={Hourglass}
          title="Rate after the service"
          message="You can rate your protector once the service is marked as completed."
          actionLabel="Back to booking"
          onAction={backToBooking}
        />
      );
    }
    if (typeof booking.rating === 'number' && !submittedRef.current) {
      return (
        <View style={styles.center}>
          <EmptyState icon={CheckCircle2} title="Thanks, you already rated this service" />
          <StarRating value={booking.rating} size={26} label="Your rating" />
          {booking.review ? (
            <AppText variant="callout" align="center" style={styles.pastReview}>
              “{booking.review}”
            </AppText>
          ) : null}
          <Button title="Back to booking" variant="outline" fullWidth={false} onPress={backToBooking} style={styles.pastBack} />
        </View>
      );
    }
    return null;
  };

  const blocking = renderState();

  const submit = async () => {
    if (!booking || submitting) return;
    if (overall === 0) {
      setFormError('Choose an overall rating from 1 to 5 stars.');
      return;
    }
    const values = Object.values(breakdown);
    const rated = values.filter((v) => v > 0).length;
    if (rated > 0 && rated < values.length) {
      setFormError('Rate all four categories, or leave them all empty.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    submittedRef.current = true;
    try {
      await bookingService.rateBooking(booking.id, {
        rating: overall,
        ratingBreakdown: rated === values.length ? breakdown : null,
        review: review.trim() || undefined,
      });
      backToBooking();
    } catch (e) {
      submittedRef.current = false;
      setFormError(e instanceof Error ? e.message : "Your rating wasn't saved. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <NavBar title="Rate service" />
      <Screen
        padTop={false}
        keyboard
        contentStyle={styles.content}
        footer={
          blocking ? null : (
            <ActionBar>
              {formError ? (
                <AppText variant="footnote" color={Colors.error} style={styles.formError} accessibilityLiveRegion="polite">
                  {formError}
                </AppText>
              ) : null}
              <Button title="Submit rating" onPress={submit} loading={submitting} />
            </ActionBar>
          )
        }
      >
        {blocking ?? (
          <>
            <View style={styles.center}>
              <Avatar name={name ?? undefined} uri={guard?.photos?.[0]} size={72} verified={guard?.kycStatus === 'approved'} />
              <AppText variant="overline" color={Colors.gold} style={styles.eyebrow}>
                {booking ? formatLongDate(booking) : ''}
              </AppText>
              <AppText variant="title2" align="center" accessibilityRole="header">
                {name ? `How did ${name} do?` : 'How was your protection?'}
              </AppText>
              <StarRating value={overall} onChange={(v) => { setOverall(v); setFormError(null); }} size={38} label="Overall rating" style={styles.overall} />
              <AppText variant="callout" color={overall ? Colors.goldLight : Colors.textTertiary} style={styles.verdict}>
                {overall ? VERDICT[overall] : 'Tap a star to rate'}
              </AppText>
            </View>

            <SectionTitle title="In detail" action={<AppText variant="caption" color={Colors.textTertiary}>Optional</AppText>} />
            <Card padded={false}>
              {CATEGORIES.map((c, i) => (
                <View key={c.key} style={[styles.category, i > 0 ? styles.categoryDivider : null]}>
                  <View style={styles.flex}>
                    <AppText variant="bodyMedium">{c.label}</AppText>
                    <AppText variant="footnote" color={Colors.textTertiary}>
                      {c.hint}
                    </AppText>
                  </View>
                  <StarRating
                    value={breakdown[c.key]}
                    onChange={(v) => {
                      setBreakdown((prev) => ({ ...prev, [c.key]: v }));
                      setFormError(null);
                    }}
                    size={20}
                    label={c.label}
                  />
                </View>
              ))}
            </Card>

            <SectionTitle title="Review" action={<AppText variant="caption" color={Colors.textTertiary}>Optional</AppText>} />
            <Input
              value={review}
              onChangeText={setReview}
              placeholder="What stood out? Your review appears on the protector's profile."
              multiline
              maxLength={1000}
              accessibilityLabel="Review"
            />
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
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  skelGap: {
    marginTop: Space.lg,
  },
  skelCards: {
    marginTop: Space.xxl,
  },
  eyebrow: {
    marginTop: Space.lg,
    marginBottom: Space.sm,
  },
  overall: {
    marginTop: Space.xl,
  },
  verdict: {
    marginTop: Space.sm,
  },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md + 2,
  },
  categoryDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderStrong,
  },
  pastReview: {
    marginTop: Space.lg,
    maxWidth: 320,
  },
  pastBack: {
    marginTop: Space.xl,
  },
  formError: {
    marginBottom: Space.sm,
  },
});
