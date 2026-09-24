// Ubicacion en vivo de una reserva.
//
// Modelo (CONTRACT §2): el escolta asignado publica su posicion en
// bookingLocations/{bookingId} mientras la reserva esta accepted/en_route/
// active; el cliente de esa reserva la lee. Nada se escribe en el perfil
// publico del escolta (antes se guardaba lat/long en users/{uid}, visible
// para cualquiera).
//
// Aqui solo hay funciones de bajo nivel. Quien decide cuando publicar es
// LocationTrackingContext (un unico publicador para toda la app).
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { ref, set, onValue } from 'firebase/database';
import { realtimeDb } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import i18n from '@/i18n';
import { PUBLIC_DEMO } from '@/constants/demo';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DevicePosition extends Coordinates {
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: number;
}

// Lo que se guarda en bookingLocations/{bookingId}.
export type BookingLocation = DevicePosition;

export type LocationPermission = 'undetermined' | 'granted' | 'denied' | 'unavailable';

export class LocationError extends Error {
  constructor(
    message: string,
    public readonly kind: 'denied' | 'unavailable' | 'timeout' | 'unknown'
  ) {
    super(message);
  }
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function toPosition(coords: {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}, timestamp: number): DevicePosition {
  const pos: DevicePosition = { latitude: coords.latitude, longitude: coords.longitude, timestamp };
  if (finite(coords.heading) && coords.heading >= 0) pos.heading = coords.heading;
  if (finite(coords.speed) && coords.speed >= 0) pos.speed = coords.speed;
  if (finite(coords.accuracy) && coords.accuracy >= 0) pos.accuracy = coords.accuracy;
  return pos;
}

// Solo primer plano. Se pide cuando de verdad empieza el seguimiento, nunca
// al abrir la app.
export async function requestLocationPermissions(): Promise<LocationPermission> {
  if (PUBLIC_DEMO) return 'granted';
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav || !('geolocation' in nav)) return 'unavailable';
    // En web el aviso del navegador aparece al empezar a vigilar la posicion.
    try {
      const status = await nav.permissions?.query({ name: 'geolocation' as PermissionName });
      if (status?.state === 'denied') return 'denied';
      if (status?.state === 'granted') return 'granted';
    } catch {
      // Safari viejo no tiene permissions.query: se sabra al vigilar.
    }
    return 'undetermined';
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch (error) {
    logger.error('[Location] Permission request failed', { error });
    return 'unavailable';
  }
}

// Empieza a vigilar la posicion del dispositivo. Devuelve la funcion para
// parar. Los errores (permiso denegado, GPS apagado) llegan por onError.
export async function watchDevicePosition(
  onPosition: (position: DevicePosition) => void,
  onError: (error: LocationError) => void
): Promise<() => void> {
  if (PUBLIC_DEMO) {
    const tick = () => onPosition({ latitude: 20.6269, longitude: -87.073, accuracy: 8, timestamp: Date.now() });
    tick(); const timer = setInterval(tick, 4000); return () => clearInterval(timer);
  }
  if (Platform.OS === 'web') {
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo) {
      onError(new LocationError(i18n.t('booking:location.browserUnavailable'), 'unavailable'));
      return () => {};
    }
    const watchId = geo.watchPosition(
      (p) => onPosition(toPosition(p.coords, p.timestamp || Date.now())),
      (e) => {
        if (e.code === 1) onError(new LocationError(i18n.t('booking:location.siteDenied'), 'denied'));
        else if (e.code === 3) onError(new LocationError(i18n.t('booking:location.timeout'), 'timeout'));
        else onError(new LocationError(i18n.t('booking:location.cantGet'), 'unavailable'));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => geo.clearWatch(watchId);
  }

  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
    (loc) => onPosition(toPosition(loc.coords, loc.timestamp || Date.now())),
    (reason) => onError(new LocationError(reason || i18n.t('booking:location.cantGet'), 'unavailable'))
  );
  return () => subscription.remove();
}

export async function publishBookingLocation(bookingId: string, position: DevicePosition): Promise<void> {
  await set(ref(realtimeDb(), `bookingLocations/${bookingId}`), { ...position, timestamp: Date.now() });
}

export function subscribeToBookingLocation(
  bookingId: string,
  callback: (location: BookingLocation | null) => void,
  onError?: (error: Error) => void
): () => void {
  if (PUBLIC_DEMO) {
    let booking: { status?: string; pickupLatitude?: number; pickupLongitude?: number } | null = null;
    const tick = () => {
      if (!booking || !['accepted', 'en_route', 'active'].includes(booking.status || '')) { callback(null); return; }
      const phase = (Date.now() % 120000) / 120000;
      callback({ latitude: (booking.pickupLatitude ?? 20.6269) + Math.sin(phase * Math.PI * 2) * 0.002, longitude: (booking.pickupLongitude ?? -87.073) + Math.cos(phase * Math.PI * 2) * 0.002, accuracy: 8, heading: phase * 360, speed: 4, timestamp: Date.now() });
    };
    const unsub = onValue(ref(realtimeDb(), `bookings/${bookingId}`), snap => { booking = snap.val(); tick(); });
    const timer = setInterval(tick, 4000);
    return () => { clearInterval(timer); unsub(); };
  }
  return onValue(
    ref(realtimeDb(), `bookingLocations/${bookingId}`),
    (snap) => {
      const value = snap.val() as BookingLocation | null;
      callback(value && finite(value.latitude) && finite(value.longitude) ? value : null);
    },
    (error) => {
      logger.error('[Location] bookingLocations subscription failed', { bookingId, error });
      onError?.(error);
    }
  );
}

// Distancia en km (haversine).
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceBetween(a: Coordinates, b: Coordinates): number {
  return calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude);
}

// Estimacion urbana simple (sin trafico). Se muestra como aproximada.
export function estimateEtaMinutes(distanceKm: number, averageSpeedKmh = 28): number {
  if (!finite(distanceKm) || distanceKm <= 0) return 0;
  return Math.max(1, Math.round((distanceKm / averageSpeedKmh) * 60));
}

export const isValidCoordinate = (c?: Partial<Coordinates> | null): c is Coordinates =>
  !!c &&
  finite(c.latitude) &&
  finite(c.longitude) &&
  Math.abs(c.latitude) <= 90 &&
  Math.abs(c.longitude) <= 180 &&
  !(c.latitude === 0 && c.longitude === 0);
