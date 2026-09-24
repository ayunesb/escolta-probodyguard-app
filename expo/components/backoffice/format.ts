import type { Tone } from '@/components/ui';
import type { KYCStatus, UserRole } from '@/types';

type Named = { firstName?: string | null; lastName?: string | null; email?: string | null };

export function fullName(u: Named | null | undefined): string {
  if (!u) return 'Unknown';
  const name = [u.firstName, u.lastName].filter((p) => typeof p === 'string' && p.trim()).join(' ').trim();
  return name || u.email || 'Unnamed account';
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export function formatDate(value: unknown): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function formatDateTime(value: unknown): string {
  const d = toDate(value);
  return d
    ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

// "Thursday, 24 September" para el eyebrow de los dashboards.
export function todayEyebrow(date = new Date()): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shortId(id?: string | null): string {
  if (!id) return '—';
  return `#${id.replace(/^-/, '').slice(-6).toUpperCase()}`;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  client: 'Client',
  guard: 'Guard',
  company: 'Company',
  admin: 'Admin',
};

export function roleLabel(role?: string | null): string {
  return (role && ROLE_LABEL[role as UserRole]) || 'Member';
}

export function kycMeta(status?: KYCStatus | string | null): { label: string; tone: Tone } {
  switch (status) {
    case 'approved':
      return { label: 'Verified', tone: 'success' };
    case 'rejected':
      return { label: 'Verification rejected', tone: 'error' };
    default:
      return { label: 'Verification pending', tone: 'warning' };
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}
