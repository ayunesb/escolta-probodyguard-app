import { get, ref } from 'firebase/database';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db as getDb, realtimeDb as getRealtimeDb } from '@/lib/firebase';
import type { Booking } from '@/types';

// Lecturas de una sola vez para el back office de admin. Nada de listeners
// sobre la base completa: cada pantalla recarga al enfocarse o al tirar hacia
// abajo. Las reglas de RTDB dejan leer /bookings completo solo a un admin.

export const bookingTime = (b: Pick<Booking, 'createdAt'>): number => {
  const t = Date.parse(b.createdAt ?? '');
  return Number.isFinite(t) ? t : 0;
};

export async function fetchAllBookings(): Promise<Booking[]> {
  const snap = await get(ref(getRealtimeDb(), 'bookings'));
  const value = snap.val() as Record<string, Booking> | null;
  if (!value) return [];
  return Object.entries(value)
    .filter(([, b]) => !!b && typeof b === 'object')
    .map(([key, b]) => ({ ...b, id: b.id || key }))
    .sort((a, b) => bookingTime(b) - bookingTime(a));
}

// Pagada = el servidor confirmo el cobro (transactionId solo lo escribe el
// servidor, ver CONTRACT §3/§4).
export const isPaid = (b: Booking): boolean => typeof b.transactionId === 'string' && b.transactionId.length > 0;

export const money = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export const ACTIVE_STATUSES: Booking['status'][] = ['accepted', 'en_route', 'active'];

export interface EmergencyAlertRow {
  id: string;
  userId: string;
  bookingId?: string | null;
  type?: string;
  status: string;
  timestamp?: string;
  location?: { latitude: number; longitude: number; accuracy?: number | null; address?: string | null } | null;
  clientId?: string | null;
  guardId?: string | null;
  userName?: string | null;
}

export async function fetchActiveEmergencyAlerts(): Promise<EmergencyAlertRow[]> {
  const snap = await getDocs(query(collection(getDb(), 'emergencyAlerts'), where('status', '==', 'active')));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<EmergencyAlertRow, 'id'>), id: d.id }))
    .sort((a, b) => (Date.parse(b.timestamp ?? '') || 0) - (Date.parse(a.timestamp ?? '') || 0));
}
