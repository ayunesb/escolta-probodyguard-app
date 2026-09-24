import { useCallback, useEffect, useState } from 'react';
import type { Booking, Guard } from '@/types';
import { bookingService } from '@/services/bookingService';
import { guardService } from '@/services/guardService';
import i18n from '@/i18n';

export interface LiveBookingState {
  booking: Booking | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  retry: () => void;
}

// Reserva en vivo: cualquier cambio de estado (aceptar, empezar, cancelar...)
// llega sin recargar la pantalla.
export function useLiveBooking(bookingId?: string | null): LiveBookingState {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    let answered = false;
    // Sin conexion RTDB no responde: se avisa en vez de cargar para siempre.
    // La suscripcion sigue viva y limpia el aviso cuando llegan datos.
    const slow = setTimeout(() => {
      if (answered) return;
      setError(i18n.t('booking:shared.stillConnecting'));
      setLoading(false);
    }, 12000);
    const unsubscribe = bookingService.subscribeToBooking(
      bookingId,
      (next) => {
        answered = true;
        setBooking(next);
        setNotFound(!next);
        setError(null);
        setLoading(false);
      },
      (err) => {
        answered = true;
        setError(err.message);
        setLoading(false);
      }
    );
    return () => {
      clearTimeout(slow);
      unsubscribe();
    };
  }, [bookingId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { booking, loading, error, notFound, retry };
}

// Perfil publico del escolta asignado (nombre, foto, telefono, KYC).
export function useGuardProfile(guardId?: string | null): { guard: Guard | null; loading: boolean } {
  const [guard, setGuard] = useState<Guard | null>(null);
  const [loading, setLoading] = useState<boolean>(!!guardId);

  useEffect(() => {
    let active = true;
    if (!guardId) {
      setGuard(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    guardService
      .getGuardById(guardId)
      .then((g) => {
        if (active) setGuard(g);
      })
      .catch(() => {
        if (active) setGuard(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [guardId]);

  return { guard, loading };
}

// Reloj que se actualiza cada `intervalMs` (para reglas que dependen de la
// hora, como compartir ubicacion desde 10 minutos antes).
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export const guardDisplayName = (guard?: Pick<Guard, 'firstName' | 'lastName'> | null): string | null => {
  if (!guard) return null;
  const first = (guard.firstName ?? '').trim();
  const last = (guard.lastName ?? '').trim();
  if (!first && !last) return null;
  return last ? `${first} ${last.charAt(0)}.`.trim() : first;
};
