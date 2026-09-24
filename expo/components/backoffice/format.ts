import type { Tone } from '@/components/ui';
import i18n from '@/i18n';
import { capitalize, formatDate as formatLocalDate, formatDateTime as formatLocalDateTime, formatNumber } from '@/i18n/format';
import type { KYCStatus, UserRole } from '@/types';

type Named = { firstName?: string | null; lastName?: string | null; email?: string | null };

export function fullName(u: Named | null | undefined): string {
  if (!u) return i18n.t('backoffice:people.unknown');
  const name = [u.firstName, u.lastName].filter((p) => typeof p === 'string' && p.trim()).join(' ').trim();
  return name || u.email || i18n.t('backoffice:people.unnamed');
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  // "2026-09-26" (solo fecha, p. ej. scheduledDate) es un dia del calendario:
  // new Date() lo leeria como medianoche UTC y en Mexico saldria un dia antes.
  const dateOnly = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// Espacios duros dentro de la fecha: "24 Sept 2026" no se parte entre dos
// renglones cuando va al final de una linea de texto.
const keepTogether = (text: string) => text.replace(/ /g, '\u00A0');

export function formatDate(value: unknown): string {
  const d = toDate(value);
  return d ? keepTogether(formatLocalDate(d, { day: 'numeric', month: 'short', year: 'numeric' })) : '—';
}

export function formatDateTime(value: unknown): string {
  const d = toDate(value);
  // Reloj de 24 h en ambos idiomas (es-MX usaria "07:00 p.m.").
  return d
    ? formatLocalDateTime(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';
}

// "Thursday 24 September" / "Jueves, 24 de septiembre" para el eyebrow de los dashboards.
export function todayEyebrow(date = new Date()): string {
  return capitalize(formatLocalDate(date, { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function shortId(id?: string | null): string {
  if (!id) return '—';
  return `#${id.replace(/^-/, '').slice(-6).toUpperCase()}`;
}

// Getters: la etiqueta se lee en el idioma activo cada vez que se usa. Mismos
// nombres de rol que el resto de la app (common:roles, "Protector"/"Escolta").
export const ROLE_LABEL: Record<UserRole, string> = {
  get client() {
    return i18n.t('common:roles.client');
  },
  get guard() {
    return i18n.t('common:roles.guard');
  },
  get company() {
    return i18n.t('common:roles.company');
  },
  get admin() {
    return i18n.t('common:roles.admin');
  },
};

export function roleLabel(role?: string | null): string {
  return (role && ROLE_LABEL[role as UserRole]) || i18n.t('backoffice:people.member');
}

export function kycMeta(status?: KYCStatus | string | null): { label: string; tone: Tone } {
  switch (status) {
    case 'approved':
      return { label: i18n.t('backoffice:kyc.approved'), tone: 'success' };
    case 'rejected':
      return { label: i18n.t('backoffice:kyc.rejected'), tone: 'error' };
    default:
      return { label: i18n.t('backoffice:kyc.pending'), tone: 'warning' };
  }
}

// Palabras que las pantallas pasaban a plural(); con ellas se busca la clave
// con plural de i18n. Las pantallas nuevas usan t('...', { count }) directo.
const PLURAL_KEYS = {
  guard: 'guards',
  review: 'reviews',
  job: 'jobs',
  'completed job': 'completedJobs',
  result: 'results',
  account: 'accounts',
  file: 'files',
  upload: 'uploads',
  booking: 'bookings',
} as const;

/** @deprecated Use t('backoffice:counts.<noun>', { count }). Se conserva por compatibilidad. */
export function plural(n: number, one: string, many = `${one}s`): string {
  const key = PLURAL_KEYS[one.toLowerCase() as keyof typeof PLURAL_KEYS];
  if (key) return i18n.t(`backoffice:counts.${key}`, { count: n });
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}
