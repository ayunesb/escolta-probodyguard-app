import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { StarRating, starCellInset } from '@/components/booking/StarRating';
import { guardDisplayName, useGuardProfile, useLiveBooking } from '@/components/booking/hooks';
import { formatLongDate } from '@/components/booking/format';
import type { RatingBreakdown } from '@/types';

// Textos en booking:rate.categories.<key> y booking:rate.verdict.<clave>.
const CATEGORIES: (keyof RatingBreakdown)[] = ['professionalism', 'punctuality', 'communication', 'languageClarity'];

const VERDICT = ['poor', 'fair', 'good', 'veryGood', 'excellent'] as const;

const CATEGORY_STAR_SIZE = 24;

const EMPTY_BREAKDOWN: RatingBreakdown = { professionalism: 0, punctuality: 0, communication: 0, languageClarity: 0 };

export default function RateBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation(['booking', 'common']);
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
        <View accessibilityLabel={t('booking:shared.loading')}>
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
      return (
        <EmptyState
          icon={AlertCircle}
          title={t('booking:shared.loadError')}
          message={error}
          actionLabel={t('common:actions.tryAgain')}
          onAction={retry}
        />
      );
    }
    if (notFound || !booking) {
      return (
        <EmptyState
          icon={SearchX}
          title={t('booking:shared.unavailableTitle')}
          message={t('booking:shared.unavailableMessage')}
          actionLabel={t('common:actions.goBack')}
          onAction={backToBooking}
        />
      );
    }
    if (!user || booking.clientId !== user.id) {
      return (
        <EmptyState
          icon={AlertCircle}
          title={t('booking:rate.onlyClientTitle')}
          message={t('booking:rate.onlyClientMessage')}
          actionLabel={t('booking:shared.backToBooking')}
          onAction={backToBooking}
        />
      );
    }
    if (booking.status !== 'completed') {
      return (
        <EmptyState
          icon={Hourglass}
          title={t('booking:rate.notYetTitle')}
          message={t('booking:rate.notYetMessage')}
          actionLabel={t('booking:shared.backToBooking')}
          onAction={backToBooking}
        />
      );
    }
    if (typeof booking.rating === 'number' && !submittedRef.current) {
      return (
        <View style={styles.center}>
          <EmptyState icon={CheckCircle2} title={t('booking:rate.alreadyRated')} />
          <StarRating value={booking.rating} size={26} label={t('booking:rate.yourRating')} />
          {booking.review ? (
            <AppText variant="callout" align="center" style={styles.pastReview}>
              {t('booking:rate.quoted', { text: booking.review })}
            </AppText>
          ) : null}
          <Button
            title={t('booking:shared.backToBooking')}
            variant="outline"
            fullWidth={false}
            onPress={backToBooking}
            style={styles.pastBack}
          />
        </View>
      );
    }
    return null;
  };

  const blocking = renderState();

  const submit = async () => {
    if (!booking || submitting) return;
    if (overall === 0) {
      setFormError(t('booking:rate.chooseOverall'));
      return;
    }
    const values = Object.values(breakdown);
    const rated = values.filter((v) => v > 0).length;
    if (rated > 0 && rated < values.length) {
      setFormError(t('booking:rate.allOrNone'));
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
      setFormError(e instanceof Error ? e.message : t('booking:rate.notSaved'));
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <NavBar title={t('booking:rate.title')} />
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
              <Button title={t('booking:rate.submit')} onPress={submit} loading={submitting} />
            </ActionBar>
          )
        }
      >
        {blocking ?? (
          <>
            <View style={styles.center}>
              <Avatar name={name ?? undefined} uri={guard?.photos?.[0]} size={72} verified={guard?.kycStatus === 'approved'} />
              <AppText variant="overline" color={Colors.accent} style={styles.eyebrow}>
                {booking ? formatLongDate(booking) : ''}
              </AppText>
              <AppText variant="title2" align="center" accessibilityRole="header">
                {name ? t('booking:rate.howDidNamed', { name }) : t('booking:rate.howWas')}
              </AppText>
              <StarRating
                value={overall}
                onChange={(v) => {
                  setOverall(v);
                  setFormError(null);
                }}
                size={38}
                label={t('booking:rate.overall')}
                style={styles.overall}
              />
              <AppText variant="callout" color={overall ? Colors.accentLight : Colors.textTertiary} style={styles.verdict}>
                {overall ? t(`booking:rate.verdict.${VERDICT[overall - 1]}`) : t('booking:rate.tapStar')}
              </AppText>
            </View>

            <SectionTitle
              title={t('booking:rate.inDetail')}
              action={
                <AppText variant="caption" color={Colors.textTertiary}>
                  {t('booking:rate.optional')}
                </AppText>
              }
            />
            <Card padded={false}>
              {CATEGORIES.map((key, i) => {
                const label = t(`booking:rate.categories.${key}.label`);
                return (
                  <View key={key} style={[styles.category, i > 0 ? styles.categoryDivider : null]}>
                    <AppText variant="bodyMedium">{label}</AppText>
                    <AppText variant="footnote" color={Colors.textTertiary}>
                      {t(`booking:rate.categories.${key}.hint`)}
                    </AppText>
                    {/* Debajo del texto: cada estrella tiene 44 px de area tactil. */}
                    <StarRating
                      value={breakdown[key]}
                      onChange={(v) => {
                        setBreakdown((prev) => ({ ...prev, [key]: v }));
                        setFormError(null);
                      }}
                      size={CATEGORY_STAR_SIZE}
                      label={label}
                      style={styles.categoryStars}
                    />
                  </View>
                );
              })}
            </Card>

            <SectionTitle
              title={t('booking:rate.review')}
              action={
                <AppText variant="caption" color={Colors.textTertiary}>
                  {t('booking:rate.optional')}
                </AppText>
              }
            />
            <Input
              value={review}
              onChangeText={setReview}
              placeholder={t('booking:rate.reviewPlaceholder')}
              multiline
              maxLength={1000}
              accessibilityLabel={t('booking:rate.review')}
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
    paddingHorizontal: Space.lg,
    paddingTop: Space.md + 2,
    paddingBottom: Space.xs,
  },
  // La celda de 44 px deja aire a los lados de la estrella: se compensa para
  // que la primera quede alineada con el texto.
  categoryStars: {
    marginTop: Space.xxs,
    marginLeft: -starCellInset(CATEGORY_STAR_SIZE),
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
