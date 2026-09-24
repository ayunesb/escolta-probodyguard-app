// Textos de presentacion de una reserva, compartidos por la lista, el detalle,
// el mapa y la calificacion. Sin datos inventados: si falta algo, null.
import type { Booking, DressCode, ProtectionType, UserRole, VehicleType } from '@/types';
import { formatMXN } from '@/utils/pricing';
import i18n from '@/i18n';
import { capitalize, formatDate, formatTimeOfDay } from '@/i18n/format';

export function scheduledDate(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): Date | null {
  if (!booking.scheduledDate) return null;
  const d = new Date(`${booking.scheduledDate}T${booking.scheduledTime || '00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Fechas en el idioma activo. Van al inicio de la linea (titulo de tarjeta,
// cabecera), asi que la primera letra va en mayuscula: "Viernes, 25 de septiembre".

// "Tuesday 24 September" / "Martes, 24 de septiembre"
export function formatLongDate(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const d = scheduledDate(booking);
  if (!d) return booking.scheduledDate || '—';
  return capitalize(formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' }));
}

// "Tue 24 Sep" / "Mar 24 de sep"
export function formatShortDate(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const d = scheduledDate(booking);
  if (!d) return booking.scheduledDate || '—';
  return capitalize(formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' }));
}

// "14:30"
export function formatTime(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const d = scheduledDate(booking);
  if (!d) return booking.scheduledTime || '—';
  return formatTimeOfDay(d);
}

export function formatDuration(hours?: number): string {
  if (!Number.isFinite(hours) || !hours) return '—';
  return i18n.t('common:units.hours', { count: hours });
}

// Mapas con getters: se leen en cada acceso, asi que siguen el idioma activo
// sin cambiar el tipo que importan otras pantallas.
export const PROTECTION_LABEL: Record<ProtectionType, string> = {
  get armed() {
    return i18n.t('booking:protection.armed');
  },
  get unarmed() {
    return i18n.t('booking:protection.unarmed');
  },
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  get standard() {
    return i18n.t('booking:vehicle.standard');
  },
  get armored() {
    return i18n.t('booking:vehicle.armored');
  },
};

export const DRESS_LABEL: Record<DressCode, string> = {
  get suit() {
    return i18n.t('booking:dress.suit');
  },
  get business_casual() {
    return i18n.t('booking:dress.business_casual');
  },
  get tactical() {
    return i18n.t('booking:dress.tactical');
  },
  get casual() {
    return i18n.t('booking:dress.casual');
  },
};

export const labelOf = <K extends string>(map: Record<K, string>, key?: string): string =>
  (key && (map as Record<string, string>)[key]) || '—';

// Importe relevante para quien mira: el cliente ve lo que paga; el escolta y
// su empresa, lo que cobra el escolta.
export function amountForViewer(booking: Booking, role?: UserRole | null): { label: string; value: string } {
  if (role === 'guard' || role === 'company') {
    return {
      label: i18n.t(role === 'guard' ? 'booking:amount.yourPayout' : 'booking:amount.protectorPayout'),
      value: formatMXN(booking.guardPayout),
    };
  }
  return { label: i18n.t('booking:amount.total'), value: formatMXN(booking.totalAmount) };
}

export function shortId(id: string): string {
  return id.replace(/^-/, '').slice(-6).toUpperCase();
}

export function timeAgo(timestamp?: number, now: number = Date.now()): string {
  if (!timestamp) return '—';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return i18n.t('booking:time.justNow');
  if (seconds < 60) return i18n.t('booking:time.secondsAgo', { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return i18n.t('booking:time.minutesAgo', { count: minutes });
  return i18n.t('booking:time.hoursAgo', { count: Math.round(minutes / 60) });
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
