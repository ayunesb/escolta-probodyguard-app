import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Hourglass,
  KeyRound,
  MapPin,
  Navigation,
  Radio,
  RefreshCcw,
  SearchX,
  ShieldCheck,
  Star,
  UserX,
  type LucideIcon,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, MAX_CONTENT_WIDTH, Radius, Space } from '@/constants/design';
import {
  ActionBar,
  AppText,
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  InfoRow,
  NavBar,
  SectionTitle,
  Skeleton,
  SkeletonCard,
  StatusBadge,
} from '@/components/ui';
import { GlassShield } from '@/components/ui/Media';
import { useAuth } from '@/contexts/AuthContext';
import { useGuardLocationPublisher } from '@/contexts/LocationTrackingContext';
import { bookingService, isLiveStatus, _shouldShowGuardLocationByRule } from '@/services/bookingService';
import { formatMXN } from '@/utils/pricing';
import StartCodeInput from '@/components/StartCodeInput';
import { ActionModal } from '@/components/booking/ActionModal';
import { BookingChat } from '@/components/booking/BookingChat';
import { StarRating } from '@/components/booking/StarRating';
import { guardDisplayName, useGuardProfile, useLiveBooking, useNow } from '@/components/booking/hooks';
import {
  DRESS_LABEL,
  PROTECTION_LABEL,
  VEHICLE_LABEL,
  formatDuration,
  formatLongDate,
  formatShortDate,
  formatTime,
  labelOf,
  shortId,
} from '@/components/booking/format';
import type { Booking } from '@/types';

type Viewer = 'client' | 'guard' | 'observer';
type ModalKind = 'reject' | 'cancel' | 'complete' | null;
type Tone = 'default' | 'accent' | 'error';

interface StatusCopy {
  icon: LucideIcon;
  title: string;
  message?: string;
  tone: Tone;
}

const CHAT_STATUSES = new Set(['confirmed', 'accepted', 'en_route', 'active', 'completed', 'cancelled']);
const CHAT_WRITABLE = new Set(['confirmed', 'accepted', 'en_route', 'active']);
const CODE_STATUSES = new Set(['confirmed', 'accepted', 'en_route']);
const CLIENT_CANCELLABLE = new Set(['pending', 'confirmed', 'accepted', 'rejected']);
const GUARD_CANCELLABLE = new Set(['accepted', 'en_route']);

const clockTime = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

function statusCopy(b: Booking, viewer: Viewer, protectorName: string | null): StatusCopy {
  // Al inicio de frase va en mayuscula; en medio, en minuscula.
  const Name = protectorName ?? 'Your protector';
  const name = protectorName ?? 'your protector';
  switch (b.status) {
    case 'pending':
      return viewer === 'client'
        ? {
            icon: CreditCard,
            title: 'Payment not completed',
            message: "This request isn't confirmed until it's paid. You can cancel it, or book again from the protector's profile.",
            tone: 'default',
          }
        : { icon: CreditCard, title: 'Awaiting payment', tone: 'default' };
    case 'confirmed':
      return viewer === 'guard'
        ? { icon: Hourglass, title: 'New request', message: 'Review the details, then accept or decline.', tone: 'accent' }
        : { icon: Hourglass, title: `Waiting for ${name} to accept`, message: 'Your booking is paid. You will see the answer here as soon as they respond.', tone: 'default' };
    case 'accepted':
      return viewer === 'guard'
        ? { icon: ShieldCheck, title: "You're booked", message: 'When you meet, ask the client for their start code to begin the service.', tone: 'default' }
        : { icon: ShieldCheck, title: `${Name} accepted`, message: 'Share your start code when you meet. Live location appears 10 minutes before the start.', tone: 'default' };
    case 'en_route':
      return viewer === 'guard'
        ? { icon: Navigation, title: 'On your way', message: 'The client can follow your live location.', tone: 'default' }
        : { icon: Navigation, title: `${Name} is on the way`, message: 'Follow their live location on the map.', tone: 'default' };
    case 'active': {
      const since = clockTime(b.startedAt);
      return { icon: Radio, title: 'Service in progress', message: since ? `Started at ${since}.` : undefined, tone: 'default' };
    }
    case 'completed': {
      const at = clockTime(b.completedAt);
      return { icon: CheckCircle2, title: 'Service completed', message: at ? `Finished at ${at}.` : undefined, tone: 'default' };
    }
    case 'rejected':
      return viewer === 'client'
        ? {
            icon: UserX,
            title: `${Name} declined`,
            message: b.rejectionReason ? `“${b.rejectionReason}” Choose another protector to keep this booking.` : 'Choose another protector to keep this booking.',
            tone: 'error',
          }
        : { icon: UserX, title: viewer === 'guard' ? 'You declined this job' : 'Declined by the protector', message: b.rejectionReason, tone: 'error' };
    case 'cancelled': {
      const by = b.cancelledBy === 'guard' ? 'the protector' : b.cancelledBy === 'client' ? 'the client' : null;
      return {
        icon: Ban,
        title: 'Booking cancelled',
        message: [by ? `Cancelled by ${by}.` : null, b.cancellationReason ? `“${b.cancellationReason}”` : null].filter(Boolean).join(' ') || undefined,
        tone: 'error',
      };
    }
    default:
      return { icon: AlertCircle, title: 'Status unavailable', tone: 'default' };
  }
}

export default function BookingDetailScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { booking, loading, error, notFound, retry } = useLiveBooking(id);
  const { guard } = useGuardProfile(booking?.guardId);

  const status = booking?.status;
  const isClient = !!user && !!booking && booking.clientId === user.id;
  const isAssignedGuard = !!user && !!booking && user.role === 'guard' && booking.guardId === user.id;
  const viewer: Viewer = isClient ? 'client' : isAssignedGuard ? 'guard' : 'observer';
  const protectorName = guardDisplayName(guard) ?? 'your protector';

  // ---- Codigo de inicio (solo el cliente) --------------------------------
  const showStartCode = isClient && !!status && CODE_STATUSES.has(status);
  const [startCode, setStartCode] = useState<string | null>(null);
  const [codeState, setCodeState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const bookingId = booking?.id;

  const loadStartCode = useCallback(async () => {
    if (!bookingId) return;
    setCodeState('loading');
    const code = await bookingService.getStartCode(bookingId);
    setStartCode(code);
    setCodeState(code ? 'ready' : 'error');
  }, [bookingId]);

  useEffect(() => {
    if (showStartCode && codeState === 'idle') void loadStartCode();
  }, [showStartCode, codeState, loadStartCode]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copyCode = async () => {
    if (!startCode) return;
    try {
      await Clipboard.setStringAsync(startCode);
      setCopied(true);
    } catch {
      // El codigo sigue visible en pantalla.
    }
  };

  // ---- Ubicacion en vivo (solo el escolta asignado) ----------------------
  const now = useNow(30000, isAssignedGuard && status === 'accepted');
  const shouldPublish = !!booking && isAssignedGuard && _shouldShowGuardLocationByRule(booking, new Date(now));
  const sharing = useGuardLocationPublisher(bookingId, shouldPublish);

  // ---- Acciones ------------------------------------------------------------
  const [modal, setModal] = useState<ModalKind>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    setActionError(null);
  }, [status]);

  // ---- Desplazar al chat (?focus=chat, desde el mapa) ----------------------
  const scrollRef = useRef<ScrollView | null>(null);
  const chatYRef = useRef<number | null>(null);
  const scrolledRef = useRef(false);
  const scrollToChat = useCallback(() => {
    if (focus !== 'chat' || scrolledRef.current || chatYRef.current === null) return;
    scrolledRef.current = true;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, chatYRef.current ?? 0), animated: true }), 150);
  }, [focus]);

  const goBackToList = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/bookings'));

  // ---- Estados de carga / error -------------------------------------------
  if (loading || error || notFound || !booking) {
    return (
      <View style={styles.root}>
        <NavBar title="Booking" />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.column}>
            {loading ? (
              <View accessibilityLabel="Loading booking">
                <Skeleton width={120} height={11} />
                <Skeleton width="70%" height={30} style={styles.skelTitle} />
                <Skeleton width="40%" height={14} style={styles.skelLine} />
                <View style={styles.skelCards}>
                  <SkeletonCard lines={2} />
                  <SkeletonCard lines={3} />
                  <SkeletonCard lines={4} />
                </View>
              </View>
            ) : error ? (
              <EmptyState icon={AlertCircle} title="Couldn't load this booking" message={error} actionLabel="Try again" onAction={retry} />
            ) : (
              <EmptyState
                icon={SearchX}
                title="Booking unavailable"
                message="It may have been removed, or you don't have access to it."
                actionLabel="Back to bookings"
                onAction={goBackToList}
              />
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  const copy = statusCopy(booking, viewer, guardDisplayName(guard));
  const StatusIcon = copy.icon;
  const statusColor = copy.tone === 'error' ? Colors.error : copy.tone === 'accent' ? Colors.accentLight : Colors.textSecondary;
  const showChat = viewer !== 'observer' && !!booking.guardId && CHAT_STATUSES.has(booking.status) && !!user;
  const canChat = CHAT_WRITABLE.has(booking.status);
  const canCancel =
    (viewer === 'client' && CLIENT_CANCELLABLE.has(booking.status)) ||
    (viewer === 'guard' && GUARD_CANCELLABLE.has(booking.status));
  const subtotal = Math.round((booking.totalAmount ?? 0) * 100 - (booking.processingFee ?? 0) * 100) / 100;
  const openMap = () => router.push(`/tracking/${booking.id}`);

  // ---- Barra de accion -----------------------------------------------------
  let actions: ReactNode = null;
  if (viewer === 'client') {
    if (isLiveStatus(booking.status)) {
      actions = <Button title="Track protector" icon={Navigation} onPress={openMap} accessibilityLabel="Track guard location" />;
    } else if (booking.status === 'completed' && typeof booking.rating !== 'number') {
      actions = (
        <Button title="Rate your protector" icon={Star} onPress={() => router.push(`/booking/rate/${booking.id}`)} />
      );
    } else if (booking.status === 'rejected') {
      actions = (
        <Button
          title="Choose another protector"
          icon={RefreshCcw}
          onPress={() => router.push(`/booking/select-guard?bookingId=${booking.id}`)}
          accessibilityLabel="Select another guard"
        />
      );
    }
  } else if (viewer === 'guard') {
    if (booking.status === 'confirmed') {
      actions = (
        <View style={styles.actionRow}>
          <Button title="Decline" variant="secondary" onPress={() => setModal('reject')} disabled={!!busy} style={styles.flex} />
          <Button
            title="Accept job"
            icon={Check}
            onPress={() => run('accept', () => bookingService.acceptBooking(booking.id))}
            loading={busy === 'accept'}
            style={styles.flex}
          />
        </View>
      );
    } else if (booking.status === 'accepted' || booking.status === 'en_route') {
      actions = (
        <View style={styles.actionRow}>
          {booking.status === 'accepted' ? (
            <Button
              title="I'm on my way"
              variant="secondary"
              onPress={() => run('enroute', () => bookingService.markEnRoute(booking.id))}
              loading={busy === 'enroute'}
              style={styles.flex}
            />
          ) : (
            <Button title="Open map" variant="secondary" icon={MapPin} onPress={openMap} style={styles.flex} />
          )}
          <Button title="Enter start code" icon={KeyRound} onPress={() => setCodeOpen(true)} disabled={!!busy} style={styles.flex} />
        </View>
      );
    } else if (booking.status === 'active') {
      actions = (
        <View style={styles.actionRow}>
          <Button title="Open map" variant="secondary" icon={MapPin} onPress={openMap} style={styles.flex} />
          <Button title="Complete service" icon={CheckCircle2} onPress={() => setModal('complete')} disabled={!!busy} style={styles.flex} />
        </View>
      );
    }
  }

  const footer =
    actions || actionError ? (
      <ActionBar>
        {actionError ? (
          <AppText variant="footnote" color={Colors.error} style={styles.actionError} accessibilityLiveRegion="polite">
            {actionError}
          </AppText>
        ) : null}
        {actions}
      </ActionBar>
    ) : null;

  return (
    <View style={styles.root}>
      <NavBar title="Booking" right={<StatusBadge status={booking.status} />} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ScrollView propio (no <Screen>) para poder desplazar hasta el chat. */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            {/* Cabecera */}
            <AppText variant="overline" color={Colors.accent}>
              {bookingService.getBookingTypeLabel(booking.bookingType)} · #{shortId(booking.id)}
            </AppText>
            <AppText variant="title1" style={styles.title} accessibilityRole="header" accessibilityLabel={formatLongDate(booking)}>
              {formatShortDate(booking)}
            </AppText>
            <AppText variant="callout" tabular>
              {formatTime(booking)} · {formatDuration(booking.duration)}
            </AppText>

            {/* Estado */}
            <Card tone={copy.tone === 'accent' ? 'accent' : 'default'} style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={[styles.statusIcon, copy.tone === 'error' ? styles.statusIconError : null]}>
                  <StatusIcon size={18} color={statusColor} strokeWidth={ICON_STROKE} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="headline">{copy.title}</AppText>
                  {copy.message ? (
                    <AppText variant="callout" style={styles.statusMessage}>
                      {copy.message}
                    </AppText>
                  ) : null}
                </View>
              </View>
            </Card>

            {/* Codigo de inicio: el cliente se lo dicta al escolta */}
            {showStartCode ? (
              <Card tone="accent" style={styles.block}>
                <View style={styles.codeRow}>
                  <View style={styles.codeMain}>
                    <View style={styles.codeHeader}>
                      <AppText variant="overline" color={Colors.accent}>
                        Start code
                      </AppText>
                      {codeState === 'ready' ? (
                        <IconButton
                          icon={copied ? Check : Copy}
                          tone="accent"
                          size={36}
                          onPress={copyCode}
                          accessibilityLabel={copied ? 'Start code copied' : 'Copy start code'}
                        />
                      ) : null}
                    </View>
                    {codeState === 'ready' && startCode ? (
                      <AppText
                        variant="numericLarge"
                        color={Colors.accentLight}
                        style={styles.code}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        selectable
                        accessibilityLabel={`Start code ${startCode.split('').join(' ')}`}
                      >
                        {startCode}
                      </AppText>
                    ) : codeState === 'error' ? (
                      <View style={styles.codeError}>
                        <AppText variant="callout">{"Your code couldn't be loaded."}</AppText>
                        <Button title="Try again" variant="ghost" size="sm" fullWidth={false} onPress={loadStartCode} />
                      </View>
                    ) : (
                      <Skeleton width={180} height={36} style={styles.code} />
                    )}
                    <AppText variant="footnote">Share this code with your protector when you meet.</AppText>
                  </View>
                  <GlassShield size={58} style={styles.codeShield} />
                </View>
              </Card>
            ) : null}

            {/* Ubicacion compartida (escolta) */}
            {viewer === 'guard' && isLiveStatus(booking.status) ? (
              <View style={styles.shareRow}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: sharing.error ? Colors.error : sharing.isPublishing ? Colors.success : Colors.textTertiary },
                  ]}
                />
                <AppText variant="footnote" style={styles.flex} accessibilityLiveRegion="polite">
                  {sharing.error
                    ? sharing.error
                    : sharing.isPublishing
                      ? 'Sharing your live location with the client.'
                      : shouldPublish
                        ? 'Starting location sharing…'
                        : 'Your location is shared from 10 minutes before the start, or once you tap “I’m on my way”.'}
                </AppText>
                {sharing.error ? (
                  <Button title="Retry" variant="ghost" size="sm" fullWidth={false} onPress={sharing.retry} />
                ) : null}
              </View>
            ) : null}

            {/* Escolta */}
            {viewer !== 'guard' && booking.guardId ? (
              <>
                <SectionTitle title={viewer === 'client' ? 'Your protector' : 'Protector'} />
                <Card
                  onPress={() => router.push(`/guard/${booking.guardId}`)}
                  accessibilityLabel={`View ${guardDisplayName(guard) ?? 'protector'} profile`}
                >
                  <View style={styles.personRow}>
                    <Avatar
                      name={guardDisplayName(guard) ?? undefined}
                      uri={guard?.photos?.[0]}
                      size={52}
                      verified={guard?.kycStatus === 'approved'}
                    />
                    <View style={styles.flex}>
                      <AppText variant="headline">{guardDisplayName(guard) ?? 'Protector'}</AppText>
                      <AppText variant="footnote">
                        {[
                          guard?.kycStatus === 'approved' ? 'Verified protector' : 'Protector',
                          guard && guard.rating > 0 && guard.completedJobs > 0
                            ? `★ ${guard.rating.toFixed(1)} · ${guard.completedJobs} ${guard.completedJobs === 1 ? 'job' : 'jobs'}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </AppText>
                    </View>
                  </View>
                </Card>
              </>
            ) : null}

            {/* Detalles */}
            <SectionTitle title="Details" />
            <Card>
              <InfoRow label="Pickup" icon={MapPin} value={booking.pickupAddress || '—'} />
              {booking.destinationAddress ? <InfoRow label="Destination" value={booking.destinationAddress} /> : null}
              {booking.routeStops?.length ? (
                <InfoRow label="Stops" value={`${booking.routeStops.length}`} />
              ) : null}
              <Divider style={styles.divider} />
              <InfoRow label="Duration" value={formatDuration(booking.duration)} />
              <InfoRow label="Protection" value={labelOf(PROTECTION_LABEL, booking.protectionType)} />
              <InfoRow label="Vehicle" value={labelOf(VEHICLE_LABEL, booking.vehicleType)} />
              <InfoRow label="Dress code" value={labelOf(DRESS_LABEL, booking.dressCode)} />
              <InfoRow label="People protected" value={`${booking.numberOfProtectees ?? '—'}`} />
              <InfoRow label="Protectors" value={`${booking.numberOfProtectors ?? '—'}`} />
            </Card>

            {/* Importes */}
            <SectionTitle title={viewer === 'guard' ? 'Earnings' : 'Payment'} />
            <Card>
              {viewer === 'guard' ? (
                <InfoRow label="Your payout" value={formatMXN(booking.guardPayout)} emphasis />
              ) : viewer === 'client' ? (
                <>
                  {typeof booking.hourlyRate === 'number' ? (
                    <InfoRow label="Rate" value={`${formatMXN(booking.hourlyRate)} / hour`} />
                  ) : null}
                  <InfoRow label="Service" value={formatMXN(subtotal)} />
                  <InfoRow label="Processing fee" value={formatMXN(booking.processingFee)} />
                  <Divider style={styles.divider} />
                  <InfoRow label={booking.status === 'pending' ? 'Total due' : 'Total paid'} value={formatMXN(booking.totalAmount)} emphasis />
                </>
              ) : (
                <>
                  {user?.role === 'admin' ? <InfoRow label="Client total" value={formatMXN(booking.totalAmount)} /> : null}
                  {user?.role === 'admin' ? <InfoRow label="Platform" value={formatMXN(booking.platformCut)} /> : null}
                  <InfoRow label="Protector payout" value={formatMXN(booking.guardPayout)} emphasis />
                </>
              )}
            </Card>

            {/* Calificacion */}
            {typeof booking.rating === 'number' ? (
              <>
                <SectionTitle title={viewer === 'client' ? 'Your rating' : 'Client rating'} />
                <Card>
                  <StarRating value={booking.rating} size={20} label="Rating" />
                  {booking.review ? (
                    <AppText variant="body" style={styles.review}>
                      {booking.review}
                    </AppText>
                  ) : null}
                </Card>
              </>
            ) : null}

            {/* Chat */}
            {showChat && user ? (
              <View
                onLayout={(e) => {
                  chatYRef.current = e.nativeEvent.layout.y;
                  scrollToChat();
                }}
              >
                <SectionTitle title="Messages" />
                <Card>
                  <BookingChat
                    bookingId={booking.id}
                    clientId={booking.clientId}
                    guardId={booking.guardId}
                    user={{ id: user.id, role: user.role, language: user.language }}
                    canSend={canChat}
                    counterpartLabel={viewer === 'guard' ? 'your client' : protectorName}
                  />
                </Card>
              </View>
            ) : null}

            {/* Acciones secundarias */}
            {canCancel || (viewer === 'client' && booking.status === 'active') ? (
              <View style={styles.secondary}>
                {viewer === 'client' && booking.status === 'active' ? (
                  <Button title="End service" variant="outline" icon={CheckCircle2} onPress={() => setModal('complete')} />
                ) : null}
                {canCancel ? (
                  <Button
                    title={viewer === 'guard' ? 'Cancel job' : 'Cancel booking'}
                    variant="danger"
                    icon={Ban}
                    onPress={() => setModal('cancel')}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>

      <ActionModal
        visible={modal === 'reject'}
        title="Decline this job?"
        message="The client is told right away and can choose another protector."
        input={{ label: 'Reason', placeholder: "e.g. I'm not available at that time", required: true }}
        confirmLabel="Decline job"
        confirmVariant="danger"
        onConfirm={(reason) => bookingService.rejectBooking(booking.id, reason)}
        onClose={() => setModal(null)}
      />
      <ActionModal
        visible={modal === 'cancel'}
        title={viewer === 'guard' ? 'Cancel this job?' : 'Cancel this booking?'}
        message={
          viewer === 'guard'
            ? 'The client is told right away. This can’t be undone.'
            : booking.guardId && booking.status !== 'pending'
              ? `${guardDisplayName(guard) ?? 'Your protector'} is told right away. This can’t be undone.`
              : 'This can’t be undone.'
        }
        input={{ label: 'Reason', placeholder: 'A short note for the record', required: true }}
        confirmLabel={viewer === 'guard' ? 'Cancel job' : 'Cancel booking'}
        confirmVariant="danger"
        cancelLabel="Keep it"
        onConfirm={(reason) => bookingService.cancelBooking(booking.id, viewer === 'guard' ? 'guard' : 'client', reason)}
        onClose={() => setModal(null)}
      />
      <ActionModal
        visible={modal === 'complete'}
        title="Complete the service?"
        message="Confirm the protection detail has finished. This can’t be undone."
        confirmLabel="Complete service"
        onConfirm={() => bookingService.completeBooking(booking.id)}
        onClose={() => setModal(null)}
      />
      <StartCodeInput
        visible={codeOpen}
        onSubmit={async (code) => {
          await bookingService.startBooking(booking.id, code);
          setCodeOpen(false);
        }}
        onCancel={() => setCodeOpen(false)}
      />
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xl,
    paddingBottom: Space.xxxl,
  },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  skelTitle: {
    marginTop: Space.md,
  },
  skelLine: {
    marginTop: Space.sm,
  },
  skelCards: {
    marginTop: Space.xxl,
  },
  title: {
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },
  statusCard: {
    marginTop: Space.xl,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconError: {
    backgroundColor: Colors.errorSoft,
  },
  statusMessage: {
    marginTop: 2,
  },
  block: {
    marginTop: Space.md,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeMain: {
    flex: 1,
  },
  codeShield: {
    marginRight: -Space.md,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  code: {
    letterSpacing: 6,
    marginTop: Space.xs,
    marginBottom: Space.sm,
  },
  codeError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Space.sm,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    paddingHorizontal: Space.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  divider: {
    marginVertical: Space.sm,
  },
  review: {
    marginTop: Space.md,
  },
  secondary: {
    marginTop: Space.xxl,
    gap: Space.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  actionError: {
    marginBottom: Space.sm,
  },
});
