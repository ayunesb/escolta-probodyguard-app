// Textos de presentacion de una reserva, compartidos por la lista, el detalle,
// el mapa y la calificacion. Sin datos inventados: si falta algo, null.
import type { Booking, DressCode, ProtectionType, UserRole, VehicleType } from '@/types';
import { formatMXN } from '@/utils/pricing';

export function scheduledDate(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): Date | null {
  if (!booking.scheduledDate) return null;
  const d = new Date(`${booking.scheduledDate}T${booking.scheduledTime || '00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "Tuesday, 24 September"
export function formatLongDate(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const d = scheduledDate(booking);
  if (!d) return booking.scheduledDate || '—';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

// "Tue 24 Sep"
export function formatShortDate(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const d = scheduledDate(booking);
  if (!d) return booking.scheduledDate || '—';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "14:30"
export function formatTime(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const d = scheduledDate(booking);
  if (!d) return booking.scheduledTime || '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(hours?: number): string {
  if (!Number.isFinite(hours) || !hours) return '—';
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export const PROTECTION_LABEL: Record<ProtectionType, string> = {
  armed: 'Armed',
  unarmed: 'Unarmed',
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  standard: 'Standard vehicle',
  armored: 'Armored vehicle',
};

export const DRESS_LABEL: Record<DressCode, string> = {
  suit: 'Suit',
  business_casual: 'Business casual',
  tactical: 'Tactical',
  casual: 'Casual',
};

export const labelOf = <K extends string>(map: Record<K, string>, key?: string): string =>
  (key && (map as Record<string, string>)[key]) || '—';

// Importe relevante para quien mira: el cliente ve lo que paga; el escolta y
// su empresa, lo que cobra el escolta.
export function amountForViewer(booking: Booking, role?: UserRole | null): { label: string; value: string } {
  if (role === 'guard' || role === 'company') {
    return { label: role === 'guard' ? 'Your payout' : 'Protector payout', value: formatMXN(booking.guardPayout) };
  }
  return { label: 'Total', value: formatMXN(booking.totalAmount) };
}

export function shortId(id: string): string {
  return id.replace(/^-/, '').slice(-6).toUpperCase();
}

export function timeAgo(timestamp?: number, now: number = Date.now()): string {
  if (!timestamp) return '—';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
