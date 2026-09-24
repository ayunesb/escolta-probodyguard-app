// Small, pure helpers shared by the booking funnel screens.
import type { Booking, DressCode, Guard } from '@/types';

/** "Sofía R." — first name plus last initial (privacy before booking). */
export function guardDisplayName(guard: Pick<Guard, 'firstName' | 'lastName'>): string {
  const first = (guard.firstName ?? '').trim();
  const initial = (guard.lastName ?? '').trim().charAt(0);
  if (!first && !initial) return 'Protector';
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
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
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

export function formatDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatScheduled(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>): string {
  const start = bookingStart(booking);
  if (!start) return [booking.scheduledDate, booking.scheduledTime].filter(Boolean).join(' · ');
  return `${formatDateLong(start)} · ${formatTime(start)}`;
}

/** Today's eyebrow, e.g. "Tuesday, 24 September". */
export function todayEyebrow(now = new Date()): string {
  return now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------------------------------------------------------------- options

export const DRESS_CODE_LABELS: Record<DressCode, string> = {
  suit: 'Suit',
  business_casual: 'Business casual',
  tactical: 'Tactical',
  casual: 'Casual',
};

export function describeBookingOptions(
  booking: Pick<Booking, 'duration' | 'protectionType' | 'vehicleType' | 'numberOfProtectors'>
): string {
  const parts = [
    `${booking.duration} h`,
    booking.protectionType === 'armed' ? 'Armed' : 'Unarmed',
    booking.vehicleType === 'armored' ? 'Armored vehicle' : 'Standard vehicle',
  ];
  if (booking.numberOfProtectors > 1) parts.push(`${booking.numberOfProtectors} protectors`);
  return parts.join(' · ');
}
