// Ubicacion en vivo, a nivel app.
//
// - El rol sale de useAuth(): ya no depende de que otra pantalla llame setRole.
// - El permiso de ubicacion se pide SOLO cuando un escolta empieza a
//   compartir su posicion para una reserva, nunca al abrir la app.
// - Hay un unico publicador: si el detalle de la reserva y el mapa estan
//   montados a la vez, piden lo mismo y se cuenta por referencias.
// - La posicion (que cambia cada pocos segundos) NO vive en el valor del
//   contexto: cada pantalla la escucha con useBookingLocation, asi el resto de
//   la app no se vuelve a renderizar con cada actualizacion.
import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';
import {
  publishBookingLocation,
  requestLocationPermissions,
  subscribeToBookingLocation,
  watchDevicePosition,
  type BookingLocation,
  type LocationPermission,
} from '@/services/locationTrackingService';
import { logger } from '@/utils/logger';

// Minimo entre escrituras: suficiente para seguir un coche en ciudad sin
// gastar bateria ni cuota.
const MIN_PUBLISH_INTERVAL_MS = 4000;

interface ActivePublisher {
  bookingId: string;
  stop: () => void;
}

export const [LocationTrackingProvider, useLocationTracking] = createContextHook(() => {
  const { user } = useAuth();
  const role: UserRole | null = user?.role ?? null;
  const userId = user?.id ?? null;

  const [permission, setPermission] = useState<LocationPermission>('undetermined');
  const [publishingBookingId, setPublishingBookingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const holdsRef = useRef(new Map<string, number>());
  const targetRef = useRef<string | null>(null);
  const activeRef = useRef<ActivePublisher | null>(null);
  const generationRef = useRef(0);
  const lastWriteRef = useRef(0);
  const errorRef = useRef<string | null>(null);

  const setErrorOnce = useCallback((message: string | null) => {
    if (errorRef.current === message) return;
    errorRef.current = message;
    setPublishError(message);
  }, []);

  const stopActive = useCallback(() => {
    generationRef.current += 1; // cancela un arranque a medias
    const active = activeRef.current;
    activeRef.current = null;
    if (active) {
      try {
        active.stop();
      } catch (error) {
        logger.error('[Location] Failed to stop watcher', { error });
      }
    }
    setPublishingBookingId(null);
  }, []);

  const startFor = useCallback(
    async (bookingId: string) => {
      stopActive();
      const generation = ++generationRef.current;
      setErrorOnce(null);

      const perm = await requestLocationPermissions();
      if (generation !== generationRef.current) return;
      setPermission(perm);
      if (perm === 'denied') {
        setErrorOnce('Location permission is off. Turn it on so your client can see you arrive.');
        return;
      }
      if (perm === 'unavailable') {
        setErrorOnce("Location isn't available on this device.");
        return;
      }

      try {
        const stop = await watchDevicePosition(
          (position) => {
            if (generation !== generationRef.current) return;
            const now = Date.now();
            if (now - lastWriteRef.current < MIN_PUBLISH_INTERVAL_MS) return;
            lastWriteRef.current = now;
            publishBookingLocation(bookingId, position)
              .then(() => {
                if (generation === generationRef.current) setErrorOnce(null);
              })
              .catch((error) => {
                logger.error('[Location] Publishing failed', { bookingId, error });
                if (generation === generationRef.current) {
                  setErrorOnce("Your location couldn't be shared. Check your connection.");
                }
              });
          },
          (error) => {
            if (generation !== generationRef.current) return;
            if (error.kind === 'denied') setPermission('denied');
            setErrorOnce(
              error.kind === 'denied'
                ? 'Location permission is off. Turn it on so your client can see you arrive.'
                : error.message
            );
          }
        );
        if (generation !== generationRef.current) {
          stop();
          return;
        }
        if (perm === 'undetermined') setPermission('granted');
        activeRef.current = { bookingId, stop };
        lastWriteRef.current = 0;
        setPublishingBookingId(bookingId);
      } catch (error) {
        logger.error('[Location] Could not start location updates', { error });
        if (generation === generationRef.current) setErrorOnce("We couldn't start sharing your location.");
      }
    },
    [setErrorOnce, stopActive]
  );

  const releaseAll = useCallback(() => {
    holdsRef.current.clear();
    targetRef.current = null;
    stopActive();
    setErrorOnce(null);
  }, [setErrorOnce, stopActive]);

  // Pide compartir la ubicacion del escolta para una reserva. Devuelve la
  // funcion para soltarla. Solo hace algo si el usuario es escolta.
  const acquirePublisher = useCallback(
    (bookingId: string): (() => void) => {
      if (role !== 'guard' || !bookingId) return () => {};
      const holds = holdsRef.current;
      holds.set(bookingId, (holds.get(bookingId) ?? 0) + 1);
      if (targetRef.current !== bookingId) {
        targetRef.current = bookingId;
        void startFor(bookingId);
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        const remaining = (holds.get(bookingId) ?? 1) - 1;
        if (remaining > 0) {
          holds.set(bookingId, remaining);
          return;
        }
        holds.delete(bookingId);
        if (targetRef.current !== bookingId) return;
        targetRef.current = null;
        stopActive();
        setErrorOnce(null);
        const next = holds.keys().next();
        if (!next.done) {
          targetRef.current = next.value;
          void startFor(next.value);
        }
      };
    },
    [role, setErrorOnce, startFor, stopActive]
  );

  // Reintento tras conceder el permiso en ajustes.
  const retryPublishing = useCallback(() => {
    if (targetRef.current) void startFor(targetRef.current);
  }, [startFor]);

  // Cambio de sesion: se deja de compartir todo.
  useEffect(() => {
    return () => releaseAll();
  }, [userId, releaseAll]);

  return useMemo(
    () => ({
      role,
      permission,
      publishingBookingId,
      publishError,
      acquirePublisher,
      retryPublishing,
    }),
    [role, permission, publishingBookingId, publishError, acquirePublisher, retryPublishing]
  );
});

// El escolta comparte su posicion para `bookingId` mientras `enabled` sea
// cierto y la pantalla este montada.
export function useGuardLocationPublisher(bookingId: string | null | undefined, enabled: boolean) {
  const { acquirePublisher, publishingBookingId, publishError, permission, retryPublishing } = useLocationTracking();

  useEffect(() => {
    if (!enabled || !bookingId) return;
    return acquirePublisher(bookingId);
  }, [enabled, bookingId, acquirePublisher]);

  return {
    isPublishing: enabled && !!bookingId && publishingBookingId === bookingId,
    error: enabled ? publishError : null,
    permission,
    retry: retryPublishing,
  };
}

export interface BookingLocationState {
  location: BookingLocation | null;
  error: string | null;
  loaded: boolean;
}

// Posicion en vivo del escolta de una reserva (estado local de la pantalla).
export function useBookingLocation(bookingId: string | null | undefined, enabled: boolean): BookingLocationState {
  const [state, setState] = useState<BookingLocationState>({ location: null, error: null, loaded: false });

  useEffect(() => {
    if (!enabled || !bookingId) {
      setState({ location: null, error: null, loaded: true });
      return;
    }
    setState((s) => ({ ...s, error: null, loaded: false }));
    return subscribeToBookingLocation(
      bookingId,
      (location) => setState({ location, error: null, loaded: true }),
      () => setState({ location: null, error: "Live location isn't available right now.", loaded: true })
    );
  }, [bookingId, enabled]);

  return state;
}
