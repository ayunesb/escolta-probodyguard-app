import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CreditCard,
  Flag,
  Hourglass,
  Info,
  Map as MapIcon,
  MapPin,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserX,
  X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { guardService, hasCompleteProfile } from '@/services/guardService';
import { bookingService, type CreateBookingInput } from '@/services/bookingService';
import { paymentService } from '@/services/paymentService';
import { stripeService } from '@/services/stripeService';
import type { DressCode, Guard, ProtectionType, RouteStop, VehicleType } from '@/types';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import {
  ActionBar,
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Input,
  ListGroup,
  NavBar,
  Screen,
  SectionTitle,
  SegmentedControl,
  Skeleton,
  SkeletonCard,
} from '@/components/ui';
import MapView, { Marker, PROVIDER_DEFAULT } from '@/components/MapView';
import PaymentSheet, { type PaymentOutcome } from '@/components/PaymentSheet';
import { PriceReceipt } from '@/components/funnel/PriceReceipt';
import { StepperRow } from '@/components/funnel/StepperRow';
import { ScheduleFields } from '@/components/funnel/ScheduleFields';
import { VehiclePicker } from '@/components/funnel/VehiclePicker';
import { geocodeAddress, getDeviceCoords, type Coords } from '@/components/funnel/deviceLocation';
import {
  DRESS_CODE_LABELS,
  formatTime,
  guardDisplayName,
  hasRating,
  isVerified,
  toDateInputValue,
  toTimeInputValue,
} from '@/components/funnel/format';
import { calculatePrice, formatMXN, PRICING } from '@/utils/pricing';
import { formatDate } from '@/i18n/format';
import { logger } from '@/utils/logger';

const MAX_PROTECTEES = 10;
const MAX_STOPS = 8;
const DEFAULT_CENTER: Coords = { latitude: 20.6296, longitude: -87.0739 }; // map viewport only

type PinSource = 'address' | 'map' | 'device';
type Pin = Coords & { source: PinSource; forAddress: string };
type DraftStop = { key: string; address: string; latitude?: number; longitude?: number };
type Phase = 'configure' | 'confirming' | 'processing' | 'confirm-failed';
type GuardState = 'loading' | 'ready' | 'missing' | 'error';

const nextFullHour = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
};

const pct = (multiplier: number) => `${Math.round((multiplier - 1) * 100)}%`;

// On web, card payments need a Stripe publishable key. Without it we say so
// up front (create.paymentsOff) instead of creating a booking that can't be paid.
const paymentsUnavailable = () => stripeService.isSupportedOnThisPlatform() && !stripeService.isConfigured();

export default function CreateBookingScreen() {
  const { t } = useTranslation(['funnel', 'common']);
  const { guardId } = useLocalSearchParams<{ guardId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  // ---------------------------------------------------------------- guard
  const [guard, setGuard] = useState<Guard | null>(null);
  const [guardState, setGuardState] = useState<GuardState>('loading');

  const loadGuard = useCallback(async () => {
    if (!guardId) {
      setGuardState('missing');
      return;
    }
    setGuardState('loading');
    try {
      const result = await guardService.getGuardById(guardId, { throwOnError: true });
      setGuard(result);
      setGuardState(result ? 'ready' : 'missing');
    } catch {
      setGuardState('error');
    }
  }, [guardId]);

  useEffect(() => {
    loadGuard();
  }, [loadGuard]);

  // ---------------------------------------------------------------- options
  const [protectionType, setProtectionType] = useState<ProtectionType>('unarmed');
  const [vehicleType, setVehicleType] = useState<VehicleType>('standard');
  const [dressCode, setDressCode] = useState<DressCode>('business_casual');
  const [numberOfProtectors, setNumberOfProtectors] = useState<number>(PRICING.MIN_PROTECTORS);
  const [numberOfProtectees, setNumberOfProtectees] = useState(1);
  const [duration, setDuration] = useState(4);
  const [start, setStart] = useState<Date>(nextFullHour);

  // ---------------------------------------------------------------- places
  const [pickupAddress, setPickupAddress] = useState('');
  const [pin, setPinState] = useState<Pin | null>(null);
  const pinRef = useRef<Pin | null>(null);
  const setPin = (next: Pin | null) => {
    pinRef.current = next;
    setPinState(next);
  };
  const [locating, setLocating] = useState(false);
  const [pickupNotice, setPickupNotice] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [newStop, setNewStop] = useState('');
  const [addingStop, setAddingStop] = useState(false);

  // ---------------------------------------------------------------- submission
  const [errors, setErrors] = useState<{ pickup?: string; schedule?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // The unpaid booking created for this screen. Reused on every retry so a
  // double tap or a second attempt never creates a duplicate.
  const pendingRef = useRef<{ id: string; signature: string } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('configure');
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Live quote — the only formula is utils/pricing.
  const quote = useMemo(() => {
    if (!guard || !hasCompleteProfile(guard)) return null;
    try {
      return calculatePrice({ hourlyRate: guard.hourlyRate, duration, vehicleType, protectionType, numberOfProtectors });
    } catch (error) {
      logger.error('[Booking] Could not price booking', error);
      return null;
    }
  }, [guard, duration, vehicleType, protectionType, numberOfProtectors]);

  const startInPast = start.getTime() < Date.now() - 60_000;
  const scheduleError = errors.schedule ?? (startInPast ? t('create.errors.pastStart') : null);
  const end = new Date(start.getTime() + duration * 3_600_000);

  // ---------------------------------------------------------------- pickup location

  /**
   * Places the typed address on the map. If geocoding fails (always on web:
   * expo-location has no web geocoder) it keeps a pin the user set on the map,
   * else falls back to the device position — and SAYS so.
   */
  const locatePickup = useCallback(async (address: string): Promise<{ pin: Pin | null; fellBack: boolean }> => {
    const text = address.trim();
    if (!text) return { pin: null, fellBack: false };
    setLocating(true);
    try {
      const geo = await geocodeAddress(text);
      if (geo) {
        const next: Pin = { ...geo, source: 'address', forAddress: text };
        setPin(next);
        setPickupNotice(null);
        return { pin: next, fellBack: false };
      }
      const current = pinRef.current;
      if (current && current.source === 'map') {
        const next: Pin = { ...current, forAddress: text };
        setPin(next);
        setPickupNotice(t('create.notices.usingMapPoint'));
        return { pin: next, fellBack: false };
      }
      const device = await getDeviceCoords({ prompt: true });
      if (device) {
        const next: Pin = { ...device, source: 'device', forAddress: text };
        setPin(next);
        setPickupNotice(t('create.notices.usingDevice'));
        return { pin: next, fellBack: true };
      }
      setPin(null);
      setPickupNotice(null);
      return { pin: null, fellBack: false };
    } finally {
      setLocating(false);
    }
  }, [t]);

  const onPickupBlur = () => {
    const text = pickupAddress.trim();
    if (text && pinRef.current?.forAddress !== text) locatePickup(text);
  };

  const toggleMap = () => {
    const opening = !showMap;
    setShowMap(opening);
    const text = pickupAddress.trim();
    if (opening && text && pinRef.current?.forAddress !== text) locatePickup(text);
  };

  const onMapPress = (e: { nativeEvent?: { coordinate?: Coords } }) => {
    const c = e?.nativeEvent?.coordinate;
    if (!c) return;
    setPin({ latitude: c.latitude, longitude: c.longitude, source: 'map', forAddress: pickupAddress.trim() });
    setPickupNotice(null);
    setErrors((prev) => ({ ...prev, pickup: undefined }));
  };

  const pickupHint = locating
    ? t('create.hints.locating')
    : pin && pin.forAddress === pickupAddress.trim()
      ? pin.source === 'address'
        ? t('create.hints.located')
        : pin.source === 'map'
          ? t('create.hints.setOnMap')
          : undefined
      : t('create.hints.default');

  // ---------------------------------------------------------------- stops

  const addStop = async () => {
    const text = newStop.trim();
    if (!text || addingStop || stops.length >= MAX_STOPS) return;
    setAddingStop(true);
    try {
      // Real coordinates or none — never invented ones.
      const coords = await geocodeAddress(text);
      setStops((prev) => [...prev, { key: `${Date.now()}-${prev.length}`, address: text, ...(coords ?? {}) }]);
      setNewStop('');
    } finally {
      setAddingStop(false);
    }
  };

  const toRouteStops = (list: DraftStop[]): RouteStop[] =>
    list.map((s, i) =>
      typeof s.latitude === 'number' && typeof s.longitude === 'number'
        ? { address: s.address, latitude: s.latitude, longitude: s.longitude, order: i + 1 }
        : // Coordinates omitted when the address couldn't be geocoded (the
          // guard still gets the address). RTDB rules don't require them.
          ({ address: s.address, order: i + 1 } as RouteStop)
    );

  // ---------------------------------------------------------------- proceed

  const handleProceed = async () => {
    if (submittingRef.current) return; // double tap
    if (paymentsUnavailable()) return; // explained in the action bar and under the price
    const text = pickupAddress.trim();
    const nextErrors: typeof errors = {};
    if (!text) nextErrors.pickup = t('create.errors.pickupRequired');
    if (start.getTime() < Date.now() - 60_000) nextErrors.schedule = t('create.errors.pastStart');
    if (!user?.id) nextErrors.form = t('create.errors.signIn');
    else if (!guard || !quote) nextErrors.form = t('create.errors.notBookable');
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    setSavedNotice(null);
    try {
      let resolved = pinRef.current && pinRef.current.forAddress === text ? pinRef.current : null;
      if (!resolved) {
        const result = await locatePickup(text);
        if (!result.pin) {
          setErrors({ pickup: t('create.errors.addressNotFound') });
          setShowMap(true);
          return;
        }
        // Fell back to the device position: stop so the notice is seen. The
        // next tap proceeds with it (or with a point the user sets on the map).
        if (result.fellBack) return;
        resolved = result.pin;
      }

      const destText = destinationAddress.trim();
      const destination = destText ? await geocodeAddress(destText) : null;

      const input: CreateBookingInput = {
        clientId: user!.id,
        guardId: guard!.id,
        companyId: guard!.companyId,
        vehicleType,
        protectionType,
        dressCode,
        numberOfProtectees,
        numberOfProtectors,
        // LOCAL date and time. toISOString() would store the UTC date next
        // to a local time and push evening bookings in Mexico to the next day.
        scheduledDate: toDateInputValue(start),
        scheduledTime: toTimeInputValue(start),
        duration,
        pickupAddress: text,
        pickupLatitude: resolved.latitude,
        pickupLongitude: resolved.longitude,
        destinationAddress: destText || undefined,
        destinationLatitude: destination?.latitude,
        destinationLongitude: destination?.longitude,
        routeStops: stops.length > 0 ? toRouteStops(stops) : undefined,
        hourlyRate: guard!.hourlyRate,
        totalAmount: quote!.total,
        processingFee: quote!.processingFee,
        platformCut: quote!.platformCut,
        guardPayout: quote!.guardPayout,
      };
      const { clientId: _clientId, ...patchable } = input;
      const signature = JSON.stringify(patchable);

      let id: string;
      if (pendingRef.current) {
        id = pendingRef.current.id;
        if (pendingRef.current.signature !== signature) {
          try {
            await bookingService.updatePendingBooking(id, {
              ...patchable,
              // Explicitly clear what the user removed since the last attempt.
              routeStops: patchable.routeStops ?? [],
              destinationAddress: patchable.destinationAddress ?? '',
            });
          } catch (error) {
            const current = await bookingService.getBookingById(id);
            if (current && current.status !== 'pending') {
              if (current.status === 'cancelled') {
                pendingRef.current = null;
                setBookingId(null);
                setErrors({ form: t('create.errors.cancelled') });
                return;
              }
              // Already paid (e.g. confirmed by the payment webhook): show it.
              router.replace(`/booking/${id}`);
              return;
            }
            throw error;
          }
          pendingRef.current = { id, signature };
        }
      } else {
        const booking = await bookingService.createBooking(input);
        id = booking.id;
        pendingRef.current = { id, signature };
      }

      setBookingId(id);
      setShowPayment(true);
    } catch (error) {
      logger.error('[Booking] Could not prepare booking for payment', error);
      setErrors({ form: error instanceof Error ? error.message : t('create.errors.saveFailed') });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------- after payment

  const confirmWithServer = async (id: string) => {
    setPhase('confirming');
    setConfirmError(null);
    try {
      const { status } = await paymentService.confirmBookingPayment(id);
      if (status === 'confirmed') {
        router.replace(`/booking/${id}`);
        return;
      }
      setPhase('processing');
    } catch (error) {
      // The money moved; only the confirmation call failed. Never say "payment
      // failed" here — the webhook confirms it anyway, and a retry is safe.
      setConfirmError(error instanceof Error ? error.message : null);
      setPhase('confirm-failed');
    }
  };

  const handlePaid = (outcome: PaymentOutcome) => {
    setShowPayment(false);
    const id = bookingId;
    if (!id) return;
    if (outcome.provider === 'braintree') {
      // The Braintree server charges and confirms in the same request.
      router.replace(`/booking/${id}`);
      return;
    }
    confirmWithServer(id);
  };

  const handlePaymentCancel = () => {
    setShowPayment(false);
    setSavedNotice(t('create.notices.saved'));
  };

  // ================================================================ render

  const frame = (content: React.ReactNode, footer?: React.ReactNode, hideBack?: boolean) => (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <NavBar title={t('create.title')} hideBack={hideBack} />
      <Screen padTop={false} keyboard contentStyle={styles.content} footer={footer}>
        {content}
      </Screen>
      {user?.id && bookingId ? (
        <PaymentSheet
          visible={showPayment}
          bookingId={bookingId}
          userId={user.id}
          onPaid={handlePaid}
          onCancel={handlePaymentCancel}
        />
      ) : null}
    </View>
  );

  if (phase === 'confirming') {
    return frame(
      <View style={styles.phase}>
        <View style={styles.phaseRing}>
          <ShieldCheck size={28} color={Colors.accent} strokeWidth={1.5} />
        </View>
        <AppText variant="title2" align="center">
          {t('create.phases.confirmingTitle')}
        </AppText>
        <AppText variant="callout" align="center" style={styles.phaseText}>
          {t('create.phases.confirmingMessage')}
        </AppText>
        <ActivityIndicator color={Colors.accent} style={styles.phaseSpinner} />
      </View>,
      undefined,
      true
    );
  }

  if (phase === 'processing' && bookingId) {
    return frame(
      <EmptyState
        icon={Hourglass}
        title={t('create.phases.processingTitle')}
        message={t('create.phases.processingMessage')}
        actionLabel={t('shared.viewBooking')}
        onAction={() => router.replace(`/booking/${bookingId}`)}
      />
    );
  }

  if (phase === 'confirm-failed' && bookingId) {
    return frame(
      <View style={styles.phase}>
        <View style={styles.phaseRing}>
          <ShieldAlert size={28} color={Colors.accent} strokeWidth={1.5} />
        </View>
        <AppText variant="title2" align="center">
          {t('create.phases.receivedTitle')}
        </AppText>
        <AppText variant="callout" align="center" style={styles.phaseText}>
          {confirmError
            ? t('create.phases.receivedMessageWithError', { error: confirmError })
            : t('create.phases.receivedMessage')}
        </AppText>
        <View style={styles.phaseActions}>
          <Button title={t('create.phases.retry')} onPress={() => confirmWithServer(bookingId)} />
          <Button title={t('shared.viewBooking')} variant="outline" onPress={() => router.replace(`/booking/${bookingId}`)} />
        </View>
      </View>,
      undefined,
      true
    );
  }

  if (guardState === 'loading') {
    return frame(
      <View accessibilityLabel={t('create.loading')}>
        <SkeletonCard media lines={1} />
        <Skeleton width="30%" height={11} style={styles.skeletonGap} />
        <Skeleton height={38} radius={Radius.sm} style={styles.skeletonGap} />
        <Skeleton width="30%" height={11} style={styles.skeletonGap} />
        <Skeleton height={38} radius={Radius.sm} style={styles.skeletonGap} />
        <Skeleton height={190} radius={Radius.lg} style={styles.skeletonGap} />
      </View>
    );
  }

  if (guardState === 'error') {
    return frame(
      <EmptyState
        icon={AlertTriangle}
        title={t('create.errorTitle')}
        message={t('shared.checkConnection')}
        actionLabel={t('common:actions.tryAgain')}
        onAction={loadGuard}
      />
    );
  }

  if (guardState === 'missing' || !guard) {
    return frame(
      <EmptyState
        icon={UserX}
        title={t('create.missingTitle')}
        message={t('create.missingMessage')}
        actionLabel={t('shared.browseProtectors')}
        onAction={() => router.replace('/home')}
      />
    );
  }

  if (!quote || !isVerified(guard) || !guard.availability) {
    return frame(
      <EmptyState
        icon={Shield}
        title={t('create.unavailableTitle')}
        message={
          !quote
            ? t('create.noRate', { name: guardDisplayName(guard) })
            : t('create.notAvailable', { name: guardDisplayName(guard) })
        }
        actionLabel={t('shared.browseProtectors')}
        onAction={() => router.replace('/home')}
      />
    );
  }

  const footer = (
    <ActionBar>
      <View style={styles.actionRow}>
        <View style={styles.totalBlock}>
          <AppText variant="overline">{t('create.total')}</AppText>
          <AppText
            variant="numeric"
            color={Colors.accentLight}
            style={styles.total}
            accessibilityLabel={t('create.totalA11y', { amount: formatMXN(quote.total) })}
          >
            {formatMXN(quote.total)}
          </AppText>
        </View>
        <Button
          title={t('create.proceed')}
          icon={CreditCard}
          size="lg"
          onPress={handleProceed}
          loading={submitting}
          disabled={!user?.id || paymentsUnavailable()}
          style={styles.flex}
          accessibilityHint={t('create.proceedHint')}
        />
      </View>
      {paymentsUnavailable() ? (
        <AppText variant="caption" color={Colors.warning} style={styles.actionNote}>
          {t('create.paymentsOffShort')}
        </AppText>
      ) : null}
    </ActionBar>
  );

  return frame(
    <>
      {/* Who */}
      <Card tone="raised" style={styles.guardCard}>
        <Avatar name={`${guard.firstName} ${guard.lastName}`} uri={guard.photos[0]} size={64} verified={isVerified(guard)} />
        <View style={styles.flex}>
          <AppText variant="overline" color={Colors.accent}>
            {t('create.yourProtector')}
          </AppText>
          <AppText variant="title2" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.guardName}>
            {guardDisplayName(guard)}
          </AppText>
          <View style={styles.inline}>
            {hasRating(guard) ? (
              <>
                <Star size={12} color={Colors.accent} fill={Colors.accent} strokeWidth={ICON_STROKE} />
                <AppText variant="caption" color={Colors.textPrimary} tabular>
                  {guard.rating.toFixed(1)}
                </AppText>
                <AppText variant="caption" color={Colors.textTertiary}>
                  ·
                </AppText>
              </>
            ) : null}
            <AppText variant="caption" color={Colors.textSecondary} tabular>
              {t('shared.rateA11y', { rate: formatMXN(guard.hourlyRate) })}
            </AppText>
          </View>
        </View>
      </Card>

      {/* Service */}
      <SectionTitle title={t('create.protection')} />
      <SegmentedControl<ProtectionType>
        value={protectionType}
        onChange={setProtectionType}
        options={[
          { value: 'unarmed', label: t('format.unarmed'), icon: Shield },
          { value: 'armed', label: t('create.armedOption', { pct: pct(PRICING.ARMED_PROTECTION_MULTIPLIER) }), icon: ShieldCheck },
        ]}
        style={styles.segmented}
      />
      <AppText variant="footnote" color={Colors.textTertiary} style={styles.caption}>
        {protectionType === 'armed' ? t('create.armedCaption') : t('create.unarmedCaption')}
      </AppText>

      <SectionTitle title={t('create.vehicle')} />
      <VehiclePicker value={vehicleType} onChange={setVehicleType} />

      <SectionTitle title={t('create.dressCode')} />
      <View style={styles.wrap}>
        {(Object.keys(DRESS_CODE_LABELS) as DressCode[]).map((code) => (
          <Chip key={code} label={DRESS_CODE_LABELS[code]} selected={dressCode === code} onPress={() => setDressCode(code)} />
        ))}
      </View>

      <SectionTitle title={t('create.team')} />
      <ListGroup>
        <StepperRow
          label={t('create.protectors')}
          hint={t('create.upTo', { max: PRICING.MAX_PROTECTORS })}
          value={numberOfProtectors}
          min={PRICING.MIN_PROTECTORS}
          max={PRICING.MAX_PROTECTORS}
          onChange={setNumberOfProtectors}
          formatSpoken={(n) => t('create.protectorsSpoken', { count: n })}
        />
        <StepperRow
          label={t('create.people')}
          hint={t('create.upTo', { max: MAX_PROTECTEES })}
          value={numberOfProtectees}
          min={1}
          max={MAX_PROTECTEES}
          onChange={setNumberOfProtectees}
        />
        <StepperRow
          label={t('create.duration')}
          hint={t('create.durationRange', { min: PRICING.MIN_DURATION_HOURS, max: PRICING.MAX_DURATION_HOURS })}
          value={duration}
          min={PRICING.MIN_DURATION_HOURS}
          max={PRICING.MAX_DURATION_HOURS}
          onChange={setDuration}
          format={(n) => t('common:units.hoursShort', { count: n })}
          formatSpoken={(n) => t('create.hoursSpoken', { count: n })}
        />
      </ListGroup>

      {/* When */}
      <SectionTitle title={t('create.schedule')} />
      <ScheduleFields
        value={start}
        onChange={(next) => {
          setStart(next);
          setErrors((prev) => ({ ...prev, schedule: undefined }));
        }}
        error={scheduleError}
      />
      {!scheduleError ? (
        <AppText variant="footnote" color={Colors.textTertiary} style={styles.caption}>
          {end.toDateString() !== start.toDateString()
            ? t('create.endsAtOn', {
                time: formatTime(end),
                date: formatDate(end, { weekday: 'short', day: 'numeric', month: 'short' }),
              })
            : t('create.endsAt', { time: formatTime(end) })}
        </AppText>
      ) : null}

      {/* Where */}
      <SectionTitle
        title={t('create.pickup')}
        action={
          <Button
            title={showMap ? t('create.hideMap') : t('create.setOnMap')}
            icon={MapIcon}
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={toggleMap}
          />
        }
      />
      <Input
        label={t('create.pickupAddress')}
        icon={MapPin}
        placeholder={t('create.pickupPlaceholder')}
        value={pickupAddress}
        onChangeText={(t) => {
          setPickupAddress(t);
          setErrors((prev) => ({ ...prev, pickup: undefined }));
        }}
        onBlur={onPickupBlur}
        onSubmitEditing={onPickupBlur}
        returnKeyType="done"
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        error={errors.pickup}
        hint={pickupHint}
        accessibilityLabel={t('create.pickupAddress')}
      />
      {pickupNotice ? <Notice icon={Info} tone="warning" text={pickupNotice} /> : null}
      {showMap ? (
        <>
          <View style={styles.mapBox}>
            <MapView
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={{ ...(pin ?? DEFAULT_CENTER), latitudeDelta: 0.01, longitudeDelta: 0.01 }}
              onPress={onMapPress}
            >
              {pin ? <Marker coordinate={{ latitude: pin.latitude, longitude: pin.longitude }} title={t('create.pickup')} /> : null}
            </MapView>
          </View>
          <AppText variant="footnote" color={Colors.textTertiary} style={styles.caption}>
            {t('create.mapHint')}
          </AppText>
        </>
      ) : null}

      <SectionTitle title={t('create.destination')} />
      <Input
        label={t('create.destinationLabel')}
        icon={Flag}
        placeholder={t('create.destinationPlaceholder')}
        value={destinationAddress}
        onChangeText={setDestinationAddress}
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        accessibilityLabel={t('create.destinationA11y')}
      />

      <SectionTitle title={stops.length > 0 ? t('create.stopsCount', { count: stops.length }) : t('create.stops')} />
      {stops.length > 0 ? (
        <ListGroup style={styles.stops}>
          {stops.map((stop, index) => (
            <View key={stop.key} style={styles.stopRow}>
              <View style={styles.stopIndex}>
                <AppText variant="caption" color={Colors.textPrimary} tabular>
                  {index + 1}
                </AppText>
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyMedium" numberOfLines={1}>
                  {stop.address}
                </AppText>
                <AppText variant="caption" color={Colors.textTertiary}>
                  {typeof stop.latitude === 'number' ? t('create.stopLocated') : t('create.stopAddressOnly')}
                </AppText>
              </View>
              <IconButton
                icon={X}
                size={32}
                tone="danger"
                onPress={() => setStops((prev) => prev.filter((s) => s.key !== stop.key))}
                accessibilityLabel={t('create.removeStop', { index: index + 1 })}
              />
            </View>
          ))}
        </ListGroup>
      ) : null}
      {stops.length < MAX_STOPS ? (
        <View style={styles.addStop}>
          <Input
            placeholder={t('create.stopPlaceholder')}
            icon={MapPin}
            value={newStop}
            onChangeText={setNewStop}
            onSubmitEditing={addStop}
            returnKeyType="done"
            containerStyle={styles.flex}
            accessibilityLabel={t('create.stopA11y')}
          />
          <Button
            title={t('create.add')}
            icon={Plus}
            variant="secondary"
            fullWidth={false}
            onPress={addStop}
            loading={addingStop}
            disabled={!newStop.trim()}
            accessibilityLabel={t('create.addStop')}
          />
        </View>
      ) : null}

      {/* How much */}
      <SectionTitle title={t('create.price')} />
      <Card tone="raised">
        <PriceReceipt breakdown={quote} duration={duration} protectors={numberOfProtectors} />
      </Card>
      <AppText variant="footnote" color={Colors.textTertiary} style={styles.caption}>
        {t('create.priceNote')}
      </AppText>

      {paymentsUnavailable() ? <Notice icon={CreditCard} tone="warning" text={t('create.paymentsOff')} /> : null}
      {savedNotice ? <Notice icon={Info} tone="info" text={savedNotice} /> : null}
      {errors.form ? <Notice icon={AlertTriangle} tone="error" text={errors.form} /> : null}
    </>,
    footer
  );
}

function Notice({ icon: Icon, tone, text }: { icon: LucideIcon; tone: 'warning' | 'info' | 'error'; text: string }) {
  const palette = {
    warning: { fg: Colors.warning, bg: Colors.warningSoft },
    info: { fg: Colors.info, bg: Colors.infoSoft },
    error: { fg: Colors.error, bg: Colors.errorSoft },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]} accessibilityLiveRegion="polite">
      <Icon size={16} color={palette.fg} strokeWidth={ICON_STROKE} />
      <AppText variant="footnote" color={Colors.textPrimary} style={styles.flex}>
        {text}
      </AppText>
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
    paddingBottom: Space.huge,
  },
  flex: {
    flex: 1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  skeletonGap: {
    marginTop: Space.lg,
  },
  guardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    padding: Space.md,
    paddingRight: Space.lg,
  },
  guardName: {
    marginTop: 2,
    marginBottom: 2,
  },
  segmented: {
    alignSelf: 'flex-start',
  },
  caption: {
    marginTop: Space.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  mapBox: {
    height: 220,
    marginTop: Space.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  stops: {
    marginBottom: Space.md,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  stopIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceLight,
  },
  addStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    marginTop: Space.md,
    padding: Space.md,
    borderRadius: Radius.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  totalBlock: {
    minWidth: 120,
  },
  actionNote: {
    marginTop: Space.sm,
  },
  total: {
    fontSize: 22,
    lineHeight: 28,
    marginTop: 2,
  },
  phase: {
    alignItems: 'center',
    paddingVertical: Space.huge,
    paddingHorizontal: Space.lg,
  },
  phaseRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: Colors.accentLine,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xl,
  },
  phaseText: {
    marginTop: Space.sm,
    maxWidth: 340,
  },
  phaseSpinner: {
    marginTop: Space.xl,
  },
  phaseActions: {
    alignSelf: 'stretch',
    gap: Space.md,
    marginTop: Space.xxl,
  },
});
