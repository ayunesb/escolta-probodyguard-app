import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { formatTimeOfDay } from '@/i18n/format';
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
  return Number.isNaN(d.getTime()) ? null : formatTimeOfDay(d);
};

function statusCopy(b: Booking, viewer: Viewer, protectorName: string | null): StatusCopy {
  // Con nombre: "Diego R. accepted". Sin nombre, frase propia ("Your
  // protector accepted") para que la mayuscula y el genero salgan bien.
  const t = i18n.t;
  const named = (key: 'confirmedClientTitle' | 'acceptedClientTitle' | 'enRouteClientTitle' | 'rejectedClientTitle') =>
    protectorName ? t(`booking:status.${key}`, { name: protectorName }) : t(`booking:status.${key}NoName`);
  switch (b.status) {
    case 'pending':
      return viewer === 'client'
        ? {
            icon: CreditCard,
            title: t('booking:status.pendingClientTitle'),
            message: t('booking:status.pendingClientMessage'),
            tone: 'default',
          }
        : { icon: CreditCard, title: t('booking:status.pendingTitle'), tone: 'default' };
    case 'confirmed':
      return viewer === 'guard'
        ? {
            icon: Hourglass,
            title: t('booking:status.confirmedGuardTitle'),
            message: t('booking:status.confirmedGuardMessage'),
            tone: 'accent',
          }
        : {
            icon: Hourglass,
            title: named('confirmedClientTitle'),
            message: t('booking:status.confirmedClientMessage'),
            tone: 'default',
          };
    case 'accepted':
      return viewer === 'guard'
        ? {
            icon: ShieldCheck,
            title: t('booking:status.acceptedGuardTitle'),
            message: t('booking:status.acceptedGuardMessage'),
            tone: 'default',
          }
        : {
            icon: ShieldCheck,
            title: named('acceptedClientTitle'),
            message: t('booking:status.acceptedClientMessage'),
            tone: 'default',
          };
    case 'en_route':
      return viewer === 'guard'
        ? {
            icon: Navigation,
            title: t('booking:status.enRouteGuardTitle'),
            message: t('booking:status.enRouteGuardMessage'),
            tone: 'default',
          }
        : {
            icon: Navigation,
            title: named('enRouteClientTitle'),
            message: t('booking:status.enRouteClientMessage'),
            tone: 'default',
          };
    case 'active': {
      const since = clockTime(b.startedAt);
      return {
        icon: Radio,
        title: t('booking:status.activeTitle'),
        message: since ? t('booking:status.activeSince', { time: since }) : undefined,
        tone: 'default',
      };
    }
    case 'completed': {
      const at = clockTime(b.completedAt);
      return {
        icon: CheckCircle2,
        title: t('booking:status.completedTitle'),
        message: at ? t('booking:status.completedAt', { time: at }) : undefined,
        tone: 'default',
      };
    }
    case 'rejected':
      return viewer === 'client'
        ? {
            icon: UserX,
            title: named('rejectedClientTitle'),
            message: b.rejectionReason
              ? t('booking:status.rejectedClientReason', { reason: b.rejectionReason })
              : t('booking:status.rejectedClientMessage'),
            tone: 'error',
          }
        : {
            icon: UserX,
            title: t(viewer === 'guard' ? 'booking:status.rejectedGuardTitle' : 'booking:status.rejectedObserverTitle'),
            message: b.rejectionReason,
            tone: 'error',
          };
    case 'cancelled': {
      const by =
        b.cancelledBy === 'guard'
          ? t('booking:status.cancelledByGuard')
          : b.cancelledBy === 'client'
            ? t('booking:status.cancelledByClient')
            : null;
      return {
        icon: Ban,
        title: t('booking:status.cancelledTitle'),
        message:
          [by, b.cancellationReason ? t('booking:status.quoted', { text: b.cancellationReason }) : null]
            .filter(Boolean)
            .join(' ') || undefined,
        tone: 'error',
      };
    }
    default:
      return { icon: AlertCircle, title: t('booking:status.unknownTitle'), tone: 'default' };
  }
}

function AddressValue({ text }: { text?: string }) {
  return (
    <AppText variant="bodyMedium" numberOfLines={3} style={styles.address}>
      {text || '—'}
    </AppText>
  );
}

export default function BookingDetailScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation(['booking', 'common']);
  const { booking, loading, error, notFound, retry } = useLiveBooking(id);
  const { guard } = useGuardProfile(booking?.guardId);

  const status = booking?.status;
  const isClient = !!user && !!booking && booking.clientId === user.id;
  const isAssignedGuard = !!user && !!booking && user.role === 'guard' && booking.guardId === user.id;
  const viewer: Viewer = isClient ? 'client' : isAssignedGuard ? 'guard' : 'observer';
  const protectorName = guardDisplayName(guard) ?? t('booking:shared.yourProtectorLower');

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
      setActionError(e instanceof Error ? e.message : t('common:errors.generic'));
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
        <NavBar title={t('booking:shared.title')} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.column}>
            {loading ? (
              <View accessibilityLabel={t('booking:shared.loading')}>
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
              <EmptyState
                icon={AlertCircle}
                title={t('booking:shared.loadError')}
                message={error}
                actionLabel={t('common:actions.tryAgain')}
                onAction={retry}
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title={t('booking:shared.unavailableTitle')}
                message={t('booking:shared.unavailableMessage')}
                actionLabel={t('booking:shared.backToBookings')}
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
      actions = (
        <Button
          title={t('booking:shared.trackProtector')}
          icon={Navigation}
          onPress={openMap}
          accessibilityLabel={t('booking:shared.trackA11y')}
        />
      );
    } else if (booking.status === 'completed' && typeof booking.rating !== 'number') {
      actions = (
        <Button
          title={t('booking:detail.rateProtector')}
          icon={Star}
          onPress={() => router.push(`/booking/rate/${booking.id}`)}
        />
      );
    } else if (booking.status === 'rejected') {
      actions = (
        <Button
          title={t('booking:shared.chooseAnother')}
          icon={RefreshCcw}
          onPress={() => router.push(`/booking/select-guard?bookingId=${booking.id}`)}
          accessibilityLabel={t('booking:shared.chooseAnotherA11y')}
        />
      );
    }
  } else if (viewer === 'guard') {
    if (booking.status === 'confirmed') {
      actions = (
        <View style={styles.actionRow}>
          <Button
            title={t('booking:detail.decline')}
            variant="secondary"
            onPress={() => setModal('reject')}
            disabled={!!busy}
            style={styles.flex}
          />
          <Button
            title={t('booking:detail.acceptJob')}
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
              title={t('booking:detail.onMyWay')}
              variant="secondary"
              onPress={() => run('enroute', () => bookingService.markEnRoute(booking.id))}
              loading={busy === 'enroute'}
              style={styles.flex}
            />
          ) : (
            <Button title={t('booking:shared.openMap')} variant="secondary" icon={MapPin} onPress={openMap} style={styles.flex} />
          )}
          <Button
            title={t('booking:shared.enterStartCodeShort')}
            icon={KeyRound}
            onPress={() => setCodeOpen(true)}
            disabled={!!busy}
            style={styles.flex}
            accessibilityLabel={t('booking:shared.enterStartCode')}
          />
        </View>
      );
    } else if (booking.status === 'active') {
      actions = (
        <View style={styles.actionRow}>
          <Button title={t('booking:shared.openMap')} variant="secondary" icon={MapPin} onPress={openMap} style={styles.flex} />
          <Button
            title={t('booking:detail.completeServiceShort')}
            icon={CheckCircle2}
            onPress={() => setModal('complete')}
            disabled={!!busy}
            style={styles.flex}
            accessibilityLabel={t('booking:detail.completeService')}
          />
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
      <NavBar title={t('booking:shared.title')} right={<StatusBadge status={booking.status} />} />
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
                    <AppText variant="overline" color={Colors.accent}>
                      {t('booking:detail.startCode')}
                    </AppText>
                    {codeState === 'ready' && startCode ? (
                      // Copiar va junto al codigo (antes flotaba a media
                      // tarjeta, pegado al escudo) y con area tactil de 44 px.
                      <View style={styles.codeValueRow}>
                        <AppText
                          variant="numericLarge"
                          color={Colors.accentLight}
                          style={styles.codeDigits}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          selectable
                          accessibilityLabel={t('booking:detail.codeA11y', { digits: startCode.split('').join(' ') })}
                        >
                          {startCode}
                        </AppText>
                        <IconButton
                          icon={copied ? Check : Copy}
                          tone="accent"
                          size={44}
                          onPress={copyCode}
                          accessibilityLabel={t(copied ? 'booking:detail.codeCopied' : 'booking:detail.copyCode')}
                        />
                      </View>
                    ) : codeState === 'error' ? (
                      <View style={styles.codeError}>
                        <AppText variant="callout" style={styles.flex}>
                          {t('booking:detail.codeLoadError')}
                        </AppText>
                        <Button
                          title={t('common:actions.tryAgain')}
                          variant="ghost"
                          size="sm"
                          fullWidth={false}
                          onPress={loadStartCode}
                        />
                      </View>
                    ) : (
                      <Skeleton width={180} height={36} style={styles.code} />
                    )}
                    <AppText variant="footnote">{t('booking:detail.codeShare')}</AppText>
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
                      ? t('booking:detail.sharing')
                      : shouldPublish
                        ? t('booking:detail.sharingStarting')
                        : t('booking:detail.sharingLater')}
                </AppText>
                {sharing.error ? (
                  <Button
                    title={t('common:actions.retry')}
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    onPress={sharing.retry}
                  />
                ) : null}
              </View>
            ) : null}

            {/* Escolta */}
            {viewer !== 'guard' && booking.guardId ? (
              <>
                <SectionTitle title={t(viewer === 'client' ? 'booking:detail.yourProtector' : 'booking:detail.protector')} />
                <Card
                  onPress={() => router.push(`/guard/${booking.guardId}`)}
                  accessibilityLabel={
                    guardDisplayName(guard)
                      ? t('booking:detail.viewProfile', { name: guardDisplayName(guard) })
                      : t('booking:detail.viewProfileNoName')
                  }
                >
                  <View style={styles.personRow}>
                    <Avatar
                      name={guardDisplayName(guard) ?? undefined}
                      uri={guard?.photos?.[0]}
                      size={52}
                      verified={guard?.kycStatus === 'approved'}
                    />
                    <View style={styles.flex}>
                      <AppText variant="headline">{guardDisplayName(guard) ?? t('booking:detail.protector')}</AppText>
                      <AppText variant="footnote">
                        {[
                          t(guard?.kycStatus === 'approved' ? 'booking:detail.verifiedProtector' : 'booking:detail.protector'),
                          guard && guard.rating > 0 && guard.completedJobs > 0
                            ? t('booking:detail.ratingJobs', { rating: guard.rating.toFixed(1), count: guard.completedJobs })
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
            <SectionTitle title={t('booking:detail.details')} />
            <Card>
              {/* Direcciones: hasta 3 lineas (con 2 se cortaba el dato que importa). */}
              <InfoRow label={t('booking:detail.pickup')} icon={MapPin} value={<AddressValue text={booking.pickupAddress} />} />
              {booking.destinationAddress ? (
                <InfoRow label={t('booking:detail.destination')} value={<AddressValue text={booking.destinationAddress} />} />
              ) : null}
              {booking.routeStops?.length ? (
                <InfoRow label={t('booking:detail.stops')} value={`${booking.routeStops.length}`} />
              ) : null}
              <Divider style={styles.divider} />
              <InfoRow label={t('booking:detail.duration')} value={formatDuration(booking.duration)} />
              <InfoRow label={t('booking:detail.protection')} value={labelOf(PROTECTION_LABEL, booking.protectionType)} />
              <InfoRow label={t('booking:detail.vehicle')} value={labelOf(VEHICLE_LABEL, booking.vehicleType)} />
              <InfoRow label={t('booking:detail.dressCode')} value={labelOf(DRESS_LABEL, booking.dressCode)} />
              <InfoRow label={t('booking:detail.peopleProtected')} value={`${booking.numberOfProtectees ?? '—'}`} />
              <InfoRow label={t('booking:detail.protectors')} value={`${booking.numberOfProtectors ?? '—'}`} />
            </Card>

            {/* Importes */}
            <SectionTitle title={t(viewer === 'guard' ? 'booking:detail.earnings' : 'booking:detail.payment')} />
            <Card>
              {viewer === 'guard' ? (
                <InfoRow label={t('booking:detail.yourPayout')} value={formatMXN(booking.guardPayout)} emphasis />
              ) : viewer === 'client' ? (
                <>
                  {typeof booking.hourlyRate === 'number' ? (
                    <InfoRow
                      label={t('booking:detail.rate')}
                      value={t('booking:detail.ratePerHour', { amount: formatMXN(booking.hourlyRate) })}
                    />
                  ) : null}
                  <InfoRow label={t('booking:detail.service')} value={formatMXN(subtotal)} />
                  <InfoRow label={t('booking:detail.processingFee')} value={formatMXN(booking.processingFee)} />
                  <Divider style={styles.divider} />
                  <InfoRow
                    label={t(booking.status === 'pending' ? 'booking:detail.totalDue' : 'booking:detail.totalPaid')}
                    value={formatMXN(booking.totalAmount)}
                    emphasis
                  />
                </>
              ) : (
                <>
                  {user?.role === 'admin' ? (
                    <InfoRow label={t('booking:detail.clientTotal')} value={formatMXN(booking.totalAmount)} />
                  ) : null}
                  {user?.role === 'admin' ? (
                    <InfoRow label={t('booking:detail.platform')} value={formatMXN(booking.platformCut)} />
                  ) : null}
                  <InfoRow label={t('booking:detail.protectorPayout')} value={formatMXN(booking.guardPayout)} emphasis />
                </>
              )}
            </Card>

            {/* Calificacion */}
            {typeof booking.rating === 'number' ? (
              <>
                <SectionTitle title={t(viewer === 'client' ? 'booking:detail.yourRating' : 'booking:detail.clientRating')} />
                <Card>
                  <StarRating value={booking.rating} size={20} label={t('booking:detail.rating')} />
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
                <SectionTitle title={t('booking:detail.messages')} />
                <Card>
                  <BookingChat
                    bookingId={booking.id}
                    clientId={booking.clientId}
                    guardId={booking.guardId}
                    user={{ id: user.id, role: user.role, language: user.language }}
                    canSend={canChat}
                    counterpartLabel={viewer === 'guard' ? t('booking:shared.yourClientLower') : protectorName}
                  />
                </Card>
              </View>
            ) : null}

            {/* Acciones secundarias */}
            {canCancel || (viewer === 'client' && booking.status === 'active') ? (
              <View style={styles.secondary}>
                {viewer === 'client' && booking.status === 'active' ? (
                  <Button
                    title={t('booking:detail.endService')}
                    variant="outline"
                    icon={CheckCircle2}
                    onPress={() => setModal('complete')}
                  />
                ) : null}
                {canCancel ? (
                  <Button
                    title={t(viewer === 'guard' ? 'booking:detail.cancelJob' : 'booking:detail.cancelBooking')}
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
        title={t('booking:modals.declineTitle')}
        message={t('booking:modals.declineMessage')}
        input={{ label: t('booking:modals.reason'), placeholder: t('booking:modals.declinePlaceholder'), required: true }}
        confirmLabel={t('booking:modals.declineConfirm')}
        confirmVariant="danger"
        onConfirm={(reason) => bookingService.rejectBooking(booking.id, reason)}
        onClose={() => setModal(null)}
      />
      <ActionModal
        visible={modal === 'cancel'}
        title={t(viewer === 'guard' ? 'booking:modals.cancelJobTitle' : 'booking:modals.cancelBookingTitle')}
        message={
          viewer === 'guard'
            ? t('booking:modals.cancelGuardMessage')
            : booking.guardId && booking.status !== 'pending'
              ? guardDisplayName(guard)
                ? t('booking:modals.cancelNamedMessage', { name: guardDisplayName(guard) })
                : t('booking:modals.cancelProtectorMessage')
              : t('booking:modals.cannotUndo')
        }
        input={{ label: t('booking:modals.reason'), placeholder: t('booking:modals.cancelPlaceholder'), required: true }}
        confirmLabel={t(viewer === 'guard' ? 'booking:modals.cancelConfirmJob' : 'booking:modals.cancelConfirmBooking')}
        confirmVariant="danger"
        cancelLabel={t('booking:modals.keepIt')}
        onConfirm={(reason) => bookingService.cancelBooking(booking.id, viewer === 'guard' ? 'guard' : 'client', reason)}
        onClose={() => setModal(null)}
      />
      <ActionModal
        visible={modal === 'complete'}
        title={t('booking:modals.completeTitle')}
        message={t('booking:modals.completeMessage')}
        confirmLabel={t('booking:detail.completeServiceShort')}
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
  code: {
    marginTop: Space.md,
    marginBottom: Space.md,
  },
  codeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.sm,
  },
  codeDigits: {
    flexShrink: 1,
    letterSpacing: 6,
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
  address: {
    flexShrink: 1,
    textAlign: 'right',
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
