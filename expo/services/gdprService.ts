import { db as getDbInstance, realtimeDb as getRealtimeDb } from '@/lib/firebase';
import { addDoc, collection, doc, getDoc, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { get, ref } from 'firebase/database';
import { monitoringService } from './monitoringService';
import { logger } from '@/utils/logger';

export interface DeletionRequest {
  userId: string;
  reason?: string;
  requestedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  completedAt?: Date;
  error?: string;
}

export interface UserDataExport {
  exportedAt: string;
  userId: string;
  // Secciones que no se pudieron leer (sin permiso o sin conexion). Se
  // informan en vez de fingir que la exportacion esta completa.
  unavailableSections: string[];
  [section: string]: unknown;
}

const serialize = (value: unknown): unknown => {
  if (value && typeof value === 'object') {
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
};

class GDPRService {
  // Derecho de cancelacion (ARCO). El borrado real lo ejecuta un
  // administrador: el cliente solo deja la solicitud registrada.
  async requestDataDeletion(userId: string, reason?: string): Promise<string> {
    try {
      const docRef = await addDoc(collection(getDbInstance(), 'deletion_requests'), {
        userId,
        reason: reason ?? null,
        requestedAt: Timestamp.fromDate(new Date()),
        status: 'pending',
      });
      await monitoringService.log('info', 'Deletion requested', { userId, requestId: docRef.id }, userId);
      return docRef.id;
    } catch (error) {
      logger.error('[GDPR] Failed to create deletion request', error);
      throw error;
    }
  }

  async getDeletionStatus(requestId: string): Promise<DeletionRequest | null> {
    try {
      const snap = await getDoc(doc(getDbInstance(), 'deletion_requests', requestId));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        userId: data.userId,
        reason: data.reason ?? undefined,
        requestedAt: data.requestedAt?.toDate?.() ?? new Date(0),
        status: data.status,
        completedAt: data.completedAt?.toDate?.(),
        error: data.error,
      };
    } catch (error) {
      logger.error('[GDPR] Failed to get deletion status', error);
      return null;
    }
  }

  // Derecho de acceso (ARCO): todo lo que la app puede leer de esta persona
  // con sus propios permisos. Cada seccion se lee por separado; si una falla,
  // se anota en unavailableSections y el resto se exporta igual.
  async exportUserData(userId: string): Promise<UserDataExport> {
    const db = getDbInstance();
    const out: UserDataExport = { exportedAt: new Date().toISOString(), userId, unavailableSections: [] };

    const section = async (name: string, read: () => Promise<unknown>) => {
      try {
        out[name] = serialize(await read());
      } catch (error) {
        logger.warn(`[GDPR] Export section unavailable: ${name}`, { code: (error as { code?: string })?.code });
        out.unavailableSections.push(name);
      }
    };

    const byField = (col: string, field: string) => async () => {
      const snap = await getDocs(query(collection(db, col), where(field, '==', userId)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    };

    await section('profile', async () => {
      const snap = await getDoc(doc(db, 'users', userId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    });

    const role = (out.profile as { role?: string } | null | undefined)?.role;

    if (role === 'guard') {
      await section('verificationDocuments', async () => {
        const snap = await getDoc(doc(db, 'users', userId, 'private', 'kyc'));
        return snap.exists() ? snap.data() : null;
      });
    }

    await section('bookings', async () => {
      const rtdb = getRealtimeDb();
      const indexPaths = role === 'guard' ? [`guardBookingIndex/${userId}`] : [`clientBookingIndex/${userId}`];
      const ids = new Set<string>();
      for (const path of indexPaths) {
        const snap = await get(ref(rtdb, path));
        Object.keys((snap.val() as Record<string, unknown> | null) ?? {}).forEach((id) => ids.add(id));
      }
      const results = await Promise.allSettled(Array.from(ids).map((id) => get(ref(rtdb, `bookings/${id}`))));
      return results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof get>>> => r.status === 'fulfilled')
        .map((r) => r.value.val())
        .filter(Boolean);
    });

    await section('messages', async () => {
      const snap = await getDocs(query(collection(db, 'messages'), where('participantIds', 'array-contains', userId)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
    await section('reviewsWritten', byField('reviews', 'clientId'));
    if (role === 'guard') {
      await section('reviewsReceived', byField('reviews', 'guardId'));
      await section('payouts', byField('payouts', 'guardId'));
      await section('ledger', byField('ledger', 'guardId'));
    }
    await section('emergencyAlerts', byField('emergencyAlerts', 'userId'));
    await section('notifications', byField('notifications', 'userId'));
    await section('deletionRequests', byField('deletion_requests', 'userId'));
    await section('privacyPreferences', async () => {
      const snap = await getDoc(doc(db, 'consents', userId));
      return snap.exists() ? snap.data() : null;
    });

    monitoringService.log('info', 'Data export completed', { userId, unavailable: out.unavailableSections.length }, userId).catch(() => {});
    return out;
  }
}

export const gdprService = new GDPRService();
