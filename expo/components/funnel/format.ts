// Small, pure helpers shared by the booking funnel screens. Text is read from
// i18n on every call, so a re-render after a language switch picks it up.
import i18n from '@/i18n';
import { capitalize, formatDate, formatTimeOfDay } from '@/i18n/format';
import type { Booking, DressCode, Guard } from '@/types';

/** "Sofía R." — first name plus last initial (privacy before booking). */
export function guardDisplayName(guard: Pick<Guard, 'firstName' | 'lastName'>): string {
  const first = (guard.firstName ?? '').trim();
  const initial = (guard.lastName ?? '').trim().charAt(0);
  if (!first && !initial) return i18n.t('funnel:shared.protectorFallback');
  return initial ? `${first} ${initial}.`.trim() : first;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/** True when the guard has at least one real review behind the rating. */
export function hasRating(guard: Pick<Guard, 'rating' | 'completedJobs'>): boolean {
  return guard.rating > 0 && guard.completedJobs > 0;
}

export function isVerified(guard: Pick<Guard, 'kycStatus'>): boolean {
  return guard.kycStatus === 'approved';
}

// ---------------------------------------------------------------- distance

type Point = { latitude: number; longitude: number };

/** Great-circle distance in kilometres. */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number): string {
  // Rounded to 100 m; 950 m and up reads "1.0 km", never "1000 m".
  const meters = Math.max(100, Math.round((km * 1000) / 100) * 100);
  if (meters < 1000) return i18n.t('funnel:format.distanceMeters', { value: meters });
  if (km < 9.95) return i18n.t('funnel:format.distanceKm', { value: Math.max(1, km).toFixed(1) });
  return i18n.t('funnel:format.distanceKm', { value: Math.round(km) });
}

// ---------------------------------------------------------------- dates

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (never toISOString, which is UTC). */
export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local wall-clock time as HH:MM. */
export function toTimeInputValue(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Parses a booking's local date + time back into a Date (null if malformed). */
export function bookingStart(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): Date | null {
  const [y, m, d] = String(booking.scheduledDate ?? '').split('-').map(Number);
  const [hh, mm] = String(booking.scheduledTime ?? '').split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** "Thu 24 Sept" / "Jue, 24 sept" (sentence-initial, so capitalised). */
export function formatDateLong(date: Date): string {
  return capitalize(formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' }));
}

/** "15:00" in both languages. */
export function formatTime(date: Date): string {
  return formatTimeOfDay(date);
}

export function formatScheduled(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const start = bookingStart(booking);
  if (!start) return [booking.scheduledDate, booking.scheduledTime].filter(Boolean).join(' · ');
  return `${formatDateLong(start)} · ${formatTime(start)}`;
}

/** Today's eyebrow, e.g. "Tuesday 24 September" / "Martes, 24 de septiembre". */
export function todayEyebrow(now = new Date()): string {
  return capitalize(formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' }));
}

// ---------------------------------------------------------------- options

// Getters: the label is looked up when read, never frozen at import time.
export const DRESS_CODE_LABELS: Record<DressCode, string> = {
  get suit() {
    return i18n.t('funnel:dressCode.suit');
  },
  get business_casual() {
    return i18n.t('funnel:dressCode.business_casual');
  },
  get tactical() {
    return i18n.t('funnel:dressCode.tactical');
  },
  get casual() {
    return i18n.t('funnel:dressCode.casual');
  },
};

export function describeBookingOptions(
  booking: Pick<Booking, 'duration' | 'protectionType' | 'vehicleType' | 'numberOfProtectors'>
): string {
  const parts = [
    i18n.t('common:units.hoursShort', { count: booking.duration }),
    booking.protectionType === 'armed' ? i18n.t('funnel:format.armed') : i18n.t('funnel:format.unarmed'),
    booking.vehicleType === 'armored' ? i18n.t('funnel:format.armoredVehicle') : i18n.t('funnel:format.standardVehicle'),
  ];
  if (booking.numberOfProtectors > 1) parts.push(i18n.t('funnel:format.protectors', { count: booking.numberOfProtectors }));
  return parts.join(' · ');
}
