import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { get, ref } from 'firebase/database';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { db as getDbInstance, realtimeDb as getRealtimeDb } from '@/lib/firebase';
import { logger } from '@/utils/logger';

export type EmergencyType = 'panic' | 'sos' | 'medical' | 'security';

export interface EmergencyLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  address?: string | null;
}

export interface EmergencyAlert {
  id: string;
  userId: string;
  bookingId?: string | null;
  clientId?: string | null;
  guardId?: string | null;
  type: EmergencyType;
  status: 'active' | 'resolved' | 'false_alarm';
  // null si el dispositivo no pudo dar ubicacion: la alerta se escribe igual
  location: EmergencyLocation | null;
  locationStatus: 'pending' | 'captured' | 'unavailable';
  timestamp: string;
  platform?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  notes?: string;
}

export interface PanicResult {
  success: boolean;
  alertId?: string;
  locationShared: boolean;
  error?: string;
}

const LOCATION_TIMEOUT_MS = 8000;
const WRITE_TIMEOUT_MS = 12000;

function timeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => resolve(v))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

function timeoutOrThrow<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// Firestore rechaza `undefined`.
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

class EmergencyService {
  // La alerta SIEMPRE se escribe, con o sin ubicacion. Antes, si el GPS no
  // respondia no se escribia nada y aun asi la app decia que "los servicios
  // de emergencia" estaban avisados. Esto solo avisa a la operacion de
  // Escolta Pro (admins); para policia/ambulancia la UI ofrece llamar al 911.
  async triggerPanicButton(userId: string, bookingId?: string, type: EmergencyType = 'panic'): Promise<PanicResult> {
    logger.log('[Emergency] Triggering alert', { type, hasBooking: !!bookingId });

    // En paralelo con la escritura: nada de esperar al GPS para avisar.
    const locationPromise = this.getCurrentLocation(LOCATION_TIMEOUT_MS);
    const partiesPromise = bookingId ? timeout(this.getBookingParties(bookingId), 5000, null) : Promise.resolve(null);

    let alertId: string;
    try {
      const created = await timeoutOrThrow(
        addDoc(
          collection(getDbInstance(), 'emergencyAlerts'),
          compact({
            userId,
            bookingId: bookingId ?? null,
            type,
            status: 'active',
            location: null,
            locationStatus: 'pending',
            timestamp: new Date().toISOString(),
            platform: Platform.OS,
          })
        ),
        WRITE_TIMEOUT_MS,
        'Timed out writing the emergency alert'
      );
      alertId = created.id;
      logger.log('[Emergency] Alert written', { alertId });
    } catch (error) {
      logger.error('[Emergency] Could not write emergency alert', error);
      return {
        success: false,
        locationShared: false,
        error: 'We could not confirm the alert reached Escolta Pro. Check your connection.',
      };
    }

    const [location, parties] = await Promise.all([locationPromise, partiesPromise]);
    try {
      await updateDoc(
        doc(getDbInstance(), 'emergencyAlerts', alertId),
        compact({
          location: location ?? null,
          locationStatus: location ? 'captured' : 'unavailable',
          clientId: parties?.clientId ?? undefined,
          guardId: parties?.guardId ?? undefined,
        })
      );
    } catch (error) {
      // La alerta ya existe; solo falta el detalle.
      logger.error('[Emergency] Could not attach location to alert', error);
      return { success: true, alertId, locationShared: false };
    }

    return { success: true, alertId, locationShared: !!location };
  }

  async resolveAlert(
    alertId: string,
    status: 'resolved' | 'false_alarm',
    notes?: string,
    resolvedBy?: string
  ): Promise<boolean> {
    try {
      await updateDoc(
        doc(getDbInstance(), 'emergencyAlerts', alertId),
        compact({ status, resolvedAt: new Date().toISOString(), notes, resolvedBy })
      );
      return true;
    } catch (error) {
      logger.error('[Emergency] Error resolving alert', error);
      return false;
    }
  }

  async getActiveAlerts(userId: string): Promise<EmergencyAlert[]> {
    try {
      const q = query(
        collection(getDbInstance(), 'emergencyAlerts'),
        where('userId', '==', userId),
        where('status', '==', 'active')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ ...(d.data() as Omit<EmergencyAlert, 'id'>), id: d.id }));
    } catch (error) {
      logger.error('[Emergency] Error getting active alerts', error);
      return [];
    }
  }

  // Las reservas viven en Realtime Database (no en Firestore).
  private async getBookingParties(bookingId: string): Promise<{ clientId?: string; guardId?: string } | null> {
    try {
      const snap = await get(ref(getRealtimeDb(), `bookings/${bookingId}`));
      if (!snap.exists()) return null;
      const b = snap.val() as { clientId?: string; guardId?: string };
      return { clientId: b.clientId, guardId: b.guardId };
    } catch (error) {
      logger.error('[Emergency] Could not read booking for alert', error);
      return null;
    }
  }

  private getCurrentLocation(timeoutMs: number): Promise<EmergencyLocation | null> {
    return timeout(this.readLocation(timeoutMs), timeoutMs, null);
  }

  private async readLocation(timeoutMs: number): Promise<EmergencyLocation | null> {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null;
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? null,
            }),
          (error) => {
            logger.warn('[Emergency] Web geolocation unavailable', { code: error?.code });
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
        );
      });
    }

    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') {
        logger.warn('[Emergency] Location permission not granted');
        return null;
      }

      // Primero la ultima posicion conocida (instantanea), luego una fresca.
      const last = await Location.getLastKnownPositionAsync({ maxAge: 120000 }).catch(() => null);
      const fresh = await timeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        Math.max(1000, timeoutMs - 1500),
        null
      );
      const position = fresh ?? last;
      if (!position) return null;

      let address: string | null = null;
      try {
        const [geocode] = await timeout(
          Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
          1500,
          []
        );
        if (geocode) {
          address = [geocode.street, geocode.streetNumber, geocode.city, geocode.region].filter(Boolean).join(' ').trim() || null;
        }
      } catch {
        address = null;
      }

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        address,
      };
    } catch (error) {
      logger.error('[Emergency] Error getting location', error);
      return null;
    }
  }
}

export const emergencyService = new EmergencyService();
