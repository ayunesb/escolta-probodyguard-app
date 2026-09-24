import { openContact } from '@/utils/openContact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatTimeOfDay } from '@/i18n/format';
import {
  AlertCircle,
  Clock,
  KeyRound,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Radio,
  SearchX,
  Shield,
  type LucideIcon,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, MAX_CONTENT_WIDTH, Radius, Shadow, Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Button,
  EmptyState,
  IconButton,
  NavBar,
  Skeleton,
  StatusBadge,
} from '@/components/ui';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type MapViewHandle } from '@/components/MapView';
import PanicButton from '@/components/PanicButton';
import StartCodeInput from '@/components/StartCodeInput';
import { useAuth } from '@/contexts/AuthContext';
import { useBookingLocation, useGuardLocationPublisher } from '@/contexts/LocationTrackingContext';
import { bookingService, isLiveStatus, _shouldShowGuardLocationByRule } from '@/services/bookingService';
import { distanceBetween, estimateEtaMinutes, isValidCoordinate } from '@/services/locationTrackingService';
import { guardDisplayName, useGuardProfile, useLiveBooking, useNow } from '@/components/booking/hooks';
import { formatDistance, formatTime, timeAgo } from '@/components/booking/format';
import type { Booking } from '@/types';

const DEFAULT_REGION = { latitude: 19.4326, longitude: -99.1332, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const STALE_AFTER_MS = 2 * 60 * 1000;

type Viewer = 'client' | 'guard' | 'observer';

function humanMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function minutesUntilVisible(booking: Booking, now: number): number | null {
  const start = new Date(`${booking.scheduledDate}T${booking.scheduledTime}`).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(1, Math.ceil((start - now) / 60000) - 10);
}

export default function TrackingScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useTranslation(['booking', 'common']);
  const { booking, loading, error, notFound, retry } = useLiveBooking(bookingId);
  const { guard } = useGuardProfile(booking?.guardId);

  const isClient = !!user && !!booking && booking.clientId === user.id;
  const isAssignedGuard = !!user && !!booking && user.role === 'guard' && booking.guardId === user.id;
  const viewer: Viewer = isClient ? 'client' : isAssignedGuard ? 'guard' : 'observer';
  const live = !!booking && isLiveStatus(booking.status);

  // Reloj para "hace X s" y para la regla de 10 minutos.
  const now = useNow(15000, live);
  const visible = !!booking && _shouldShowGuardLocationByRule(booking, new Date(now));

  // El escolta publica; cliente, escolta y admin leen.
  const sharing = useGuardLocationPublisher(booking?.id, isAssignedGuard && visible);
  const canRead = viewer !== 'observer' || user?.role === 'admin';
  const { location, error: locationError } = useBookingLocation(booking?.id, canRead && visible);

  const pickup = useMemo(
    () =>
      booking && isValidCoordinate({ latitude: booking.pickupLatitude, longitude: booking.pickupLongitude })
        ? { latitude: booking.pickupLatitude, longitude: booking.pickupLongitude }
        : null,
    [booking]
  );
  const guardLat = visible && location && isValidCoordinate(location) ? location.latitude : null;
  const guardLng = visible && location && isValidCoordinate(location) ? location.longitude : null;
  const guardPoint = useMemo(
    () => (guardLat !== null && guardLng !== null ? { latitude: guardLat, longitude: guardLng } : null),
    [guardLat, guardLng]
  );
  const stale = !!location && now - location.timestamp > STALE_AFTER_MS;
  const heading = booking?.status === 'accepted' || booking?.status === 'en_route';
  const distanceKm = guardPoint && pickup && heading ? distanceBetween(guardPoint, pickup) : null;

  // ---- Mapa: encuadre ------------------------------------------------------
  const mapRef = useRef<MapViewHandle | null>(null);
  const [sheetHeight, setSheetHeight] = useState(260);
  const fittedRef = useRef(false);
  const initialRegion = useMemo(
    () => (pickup ? { ...pickup, latitudeDelta: 0.03, longitudeDelta: 0.03 } : DEFAULT_REGION),
    // Solo la primera vez: despues se mueve con fitToCoordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!pickup]
  );

  const fit = useCallback(() => {
    const points = [pickup, guardPoint].filter(Boolean) as { latitude: number; longitude: number }[];
    if (points.length === 0) return;
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 72, right: 56, bottom: sheetHeight + 32, left: 56 },
      animated: true,
    });
  }, [pickup, guardPoint, sheetHeight]);

  useEffect(() => {
    if (!guardPoint || fittedRef.current) return;
    fittedRef.current = true;
    fit();
  }, [guardPoint, fit]);

  // ---- Codigo de inicio (escolta) ------------------------------------------
  const [codeOpen, setCodeOpen] = useState(false);

  // ---- Estados de carga / error -------------------------------------------
  if (loading || error || notFound || !booking) {
    return (
      <View style={styles.root}>
        <NavBar title={t('booking:tracking.title')} />
        {loading ? (
          <View style={styles.flex} accessibilityLabel={t('booking:tracking.loadingMap')}>
            <Skeleton width="100%" height={0} radius={0} style={styles.mapSkeleton} />
            <View style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, Space.lg) }]}>
              <View style={styles.sheet}>
                <View style={styles.headerRow}>
                  <Skeleton width={48} height={48} radius={14} />
                  <View style={styles.flex}>
                    <Skeleton width="50%" height={14} />
                    <Skeleton width="30%" height={11} style={styles.skelGap} />
                  </View>
                </View>
                <Skeleton width="80%" height={12} style={styles.skelBlock} />
                <Skeleton width="100%" height={50} radius={Radius.md} style={styles.skelBlock} />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.centerState}>
            {error ? (
              <EmptyState
                icon={AlertCircle}
                title={t('booking:tracking.loadError')}
                message={error}
                actionLabel={t('common:actions.tryAgain')}
                onAction={retry}
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title={t('booking:shared.unavailableTitle')}
                message={t('booking:shared.unavailableMessage')}
                actionLabel={t('common:actions.goBack')}
                onAction={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/bookings'))}
              />
            )}
          </View>
        )}
      </View>
    );
  }

  // ---- Mensaje de estado -----------------------------------------------------
  const name = guardDisplayName(guard);
  let statusIcon: LucideIcon = Clock;
  let statusText: string;
  let statusTone: string = Colors.textSecondary;
  switch (booking.status) {
    case 'pending':
    case 'confirmed':
      statusText = t('booking:tracking.notAccepted');
      break;
    case 'accepted':
    case 'en_route':
      if (!visible) {
        const mins = minutesUntilVisible(booking, now);
        if (viewer === 'guard') {
          statusText = mins
            ? t('booking:tracking.guardNotYetIn', { time: humanMinutes(mins) })
            : t('booking:tracking.guardNotYet');
        } else {
          statusText = mins
            ? t('booking:tracking.clientNotYetIn', { time: humanMinutes(mins) })
            : t('booking:tracking.clientNotYet');
        }
      } else if (!canRead) {
        statusText = t('booking:tracking.onlyParticipants');
      } else if (!location) {
        statusIcon = Radio;
        statusText =
          viewer === 'guard'
            ? t('booking:tracking.waitingOwn')
            : name
              ? t('booking:tracking.waitingNamed', { name })
              : t('booking:tracking.waitingProtector');
      } else {
        statusIcon = Navigation;
        statusTone = Colors.accent;
        statusText =
          viewer === 'guard'
            ? t('booking:tracking.headingOwn')
            : name
              ? t('booking:tracking.headingNamed', { name })
              : t('booking:tracking.headingProtector');
      }
      break;
    case 'active':
      statusIcon = Shield;
      statusTone = Colors.success;
      statusText = booking.startedAt
        ? t('booking:tracking.activeSince', { time: formatTimeOfDay(new Date(booking.startedAt)) })
        : t('booking:tracking.active');
      break;
    case 'completed':
      statusText = t('booking:tracking.completed');
      break;
    default:
      statusText = t('booking:tracking.ended');
  }
  if (locationError && visible && canRead) {
    statusIcon = AlertCircle;
    statusTone = Colors.warning;
    statusText = locationError;
  } else if (stale && visible && location) {
    statusIcon = AlertCircle;
    statusTone = Colors.warning;
    statusText = t('booking:tracking.stale', { ago: timeAgo(location.timestamp, now) });
  }
  const StatusIcon = statusIcon;

  const phone = viewer === 'client' ? (guard?.phone ?? '').replace(/[^\d+]/g, '') : '';
  const openChat = () => router.push(`/booking/${booking.id}?focus=chat`);
  const canStart = viewer === 'guard' && (booking.status === 'accepted' || booking.status === 'en_route');

  return (
    <View style={styles.root}>
      <NavBar title={t('booking:tracking.title')} right={<StatusBadge status={booking.status} />} />

      <View style={styles.flex}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          accessibilityLabel={t('booking:tracking.mapA11y')}
        >
          {pickup ? (
            <Marker
              coordinate={pickup}
              title={t('booking:tracking.pickupMarker')}
              description={booking.pickupAddress}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.pickupPin}>
                <MapPin size={16} color={Colors.textPrimary} strokeWidth={ICON_STROKE} />
              </View>
            </Marker>
          ) : null}
          {guardPoint ? (
            <Marker
              coordinate={guardPoint}
              title={viewer === 'guard' ? t('booking:tracking.you') : (name ?? t('booking:shared.yourProtector'))}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={10}
            >
              <View style={[styles.guardHalo, stale ? styles.guardHaloStale : null]}>
                <View style={styles.guardPin}>
                  <Shield size={18} color={Colors.accent} strokeWidth={ICON_STROKE} />
                </View>
              </View>
            </Marker>
          ) : null}
          {guardPoint && pickup && heading ? (
            <Polyline coordinates={[guardPoint, pickup]} strokeColor={Colors.accent} strokeWidth={3} lineDashPattern={[8, 8]} />
          ) : null}
        </MapView>

        <View style={styles.floating} pointerEvents="box-none">
          {user ? (
            <PanicButton userId={user.id} bookingId={booking.id} size="small" />
          ) : null}
          {pickup || guardPoint ? (
            <IconButton
              icon={LocateFixed}
              onPress={fit}
              accessibilityLabel={t('booking:tracking.recenter')}
              size={44}
              style={styles.recenter}
            />
          ) : null}
        </View>

        <View
          style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, Space.lg) }]}
          pointerEvents="box-none"
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.sheet}>
            {/* Quien */}
            <View style={styles.headerRow}>
              {viewer === 'guard' ? (
                <View style={styles.pickupBadge}>
                  <MapPin size={20} color={Colors.accent} strokeWidth={ICON_STROKE} />
                </View>
              ) : (
                <Avatar name={name ?? undefined} uri={guard?.photos?.[0]} size={48} verified={guard?.kycStatus === 'approved'} />
              )}
              <View style={styles.flex}>
                <AppText variant="headline" numberOfLines={1}>
                  {viewer === 'guard' ? t('booking:tracking.clientPickup') : (name ?? t('booking:shared.yourProtector'))}
                </AppText>
                <AppText variant="footnote" numberOfLines={2}>
                  {viewer === 'guard'
                    ? booking.pickupAddress || '—'
                    : t('booking:tracking.pickupAt', { time: formatTime(booking), address: booking.pickupAddress || '—' })}
                </AppText>
              </View>
            </View>

            {/* Estado */}
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <StatusIcon size={16} color={statusTone} strokeWidth={ICON_STROKE} />
              <AppText variant="callout" color={statusTone === Colors.textSecondary ? Colors.textSecondary : Colors.textPrimary} style={styles.flex}>
                {statusText}
              </AppText>
            </View>

            {/* Cifras (solo con ubicacion real) */}
            {distanceKm !== null ? (
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <AppText variant="overline">{t('booking:tracking.distance')}</AppText>
                  <AppText variant="numeric">{formatDistance(distanceKm)}</AppText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <AppText variant="overline">{t('booking:tracking.eta')}</AppText>
                  <AppText variant="numeric">{humanMinutes(estimateEtaMinutes(distanceKm))}</AppText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <AppText variant="overline">{t('booking:tracking.updated')}</AppText>
                  <AppText variant="numeric">{timeAgo(location?.timestamp, now)}</AppText>
                </View>
              </View>
            ) : null}

            {viewer === 'guard' && sharing.error ? (
              <View style={styles.shareError}>
                <AppText variant="footnote" color={Colors.error} style={styles.flex}>
                  {sharing.error}
                </AppText>
                <Button
                  title={t('common:actions.retry')}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onPress={sharing.retry}
                />
              </View>
            ) : null}

            {/* Acciones */}
            {canStart ? (
              <Button
                title={t('booking:shared.enterStartCode')}
                icon={KeyRound}
                onPress={() => setCodeOpen(true)}
                style={styles.primary}
              />
            ) : null}
            {viewer !== 'observer' ? (
              <View style={styles.actions}>
                <Button
                  title={t('booking:tracking.message')}
                  icon={MessageCircle}
                  variant="secondary"
                  onPress={openChat}
                  style={styles.flex}
                  accessibilityLabel={t(viewer === 'guard' ? 'booking:tracking.messageClient' : 'booking:tracking.messageProtector')}
                />
                {phone ? (
                  <Button
                    title={t('booking:tracking.call')}
                    icon={Phone}
                    variant="secondary"
                    onPress={() => {
                      openContact(`tel:${phone}`).catch(() => {});
                    }}
                    style={styles.flex}
                    accessibilityLabel={name ? t('booking:tracking.callNamed', { name }) : t('booking:tracking.callProtector')}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>

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
  centerState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Space.gutter,
  },
  mapSkeleton: {
    ...StyleSheet.absoluteFillObject,
    height: undefined,
  },
  skelGap: {
    marginTop: Space.sm,
  },
  skelBlock: {
    marginTop: Space.lg,
  },
  floating: {
    position: 'absolute',
    top: Space.lg,
    right: Space.lg,
    alignItems: 'flex-end',
    gap: Space.md,
  },
  recenter: {
    ...Shadow.md,
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Space.md,
  },
  sheet: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    padding: Space.xl,
    ...Shadow.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  pickupBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: Colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    marginTop: Space.lg,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.lg,
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: Colors.borderStrong,
  },
  shareError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
  },
  primary: {
    marginTop: Space.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.md,
  },
  pickupPin: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardHalo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardHaloStale: {
    backgroundColor: Colors.warningSoft,
  },
  guardPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
