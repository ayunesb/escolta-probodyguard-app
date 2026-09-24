import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  QueryConstraint,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db as getDb, realtimeDb as getRealtimeDb } from '@/lib/firebase';
import { ref as rtdbRef, remove } from 'firebase/database';
import type { KYCStatus, User, UserRole } from '@/types';
import { logger } from '@/utils/logger';

// Perfil tal como viene de Firestore. Los campos opcionales no estan en todos
// los documentos (cuentas creadas antes de que existieran, o sin terminar).
export type UserRecord = User & {
  suspended?: boolean;
  photos?: string[];
  outfitPhotos?: string[];
  companyName?: string;
  companyId?: string | null;
  hourlyRate?: number;
  availability?: boolean;
  rating?: number;
  completedJobs?: number;
  certifications?: string[];
};

// Documentos KYC: viven en users/{uid}/private/kyc, NUNCA en el perfil
// publico (que lee cualquier usuario autenticado). CONTRACT §5.
export const KYC_DOC_FIELDS = ['governmentIdUrls', 'licenseUrls', 'vehicleDocUrls', 'insuranceUrls'] as const;
export type KycDocField = (typeof KYC_DOC_FIELDS)[number];

export interface GuardKycRecord {
  governmentIdUrls?: string[];
  licenseUrls?: string[];
  vehicleDocUrls?: string[];
  insuranceUrls?: string[];
  // Revision del administrador
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  updatedAt?: string;
}

// Fotos que se muestran a los clientes: se quedan en el perfil publico.
export type PublicGuardMediaField = 'photos' | 'outfitPhotos';

export const isSuspended = (u: { suspended?: boolean } | null | undefined): boolean => u?.suspended === true;

export function countKycDocuments(kyc: GuardKycRecord | null | undefined): number {
  if (!kyc) return 0;
  return KYC_DOC_FIELDS.reduce((n, f) => n + (Array.isArray(kyc[f]) ? (kyc[f] as string[]).length : 0), 0);
}

const nowIso = () => new Date().toISOString();
const usersCol = () => collection(getDb(), 'users');
const kycRef = (uid: string) => doc(getDb(), 'users', uid, 'private', 'kyc');
const toUser = (id: string, data: Record<string, unknown>): UserRecord => ({ ...(data as object), id } as UserRecord);

export interface UserCountFilter {
  role?: UserRole;
  kycStatus?: KYCStatus;
  availability?: boolean;
  suspended?: boolean;
}

export const userService = {
  // Lanza si falla (p. ej. permiso denegado) para que la pantalla muestre un
  // error con reintento en vez de "no hay usuarios".
  async listByRole(role: UserRole): Promise<UserRecord[]> {
    const snapshot = await getDocs(query(usersCol(), where('role', '==', role)));
    return snapshot.docs.map((d) => toUser(d.id, d.data()));
  },

  async fetchGuardsForCompany(companyId: string): Promise<UserRecord[]> {
    const snapshot = await getDocs(
      query(usersCol(), where('role', '==', 'guard'), where('companyId', '==', companyId))
    );
    return snapshot.docs.map((d) => toUser(d.id, d.data()));
  },

  // Version que nunca lanza (la usa bookingService para componer reservas).
  async listGuardsForCompany(companyId: string): Promise<UserRecord[]> {
    try {
      return await this.fetchGuardsForCompany(companyId);
    } catch (error) {
      logger.error(`[UserService] Failed to list guards for company: ${companyId}`, error);
      return [];
    }
  },

  async getUser(uid: string): Promise<UserRecord | null> {
    const snap = await getDoc(doc(getDb(), 'users', uid));
    return snap.exists() ? toUser(snap.id, snap.data()) : null;
  },

  // Lecturas puntuales por id (p. ej. nombres de las reservas recientes) en
  // vez de descargar el padron completo.
  async getUsersByIds(ids: (string | null | undefined)[]): Promise<Record<string, UserRecord>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
    const results = await Promise.allSettled(unique.map((id) => this.getUser(id)));
    const map: Record<string, UserRecord> = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) map[r.value.id] = r.value;
    });
    return map;
  },

  // Conteo en el servidor: no descarga documentos.
  async countUsers(filter: UserCountFilter): Promise<number> {
    const constraints: QueryConstraint[] = [];
    if (filter.role) constraints.push(where('role', '==', filter.role));
    if (filter.kycStatus) constraints.push(where('kycStatus', '==', filter.kycStatus));
    if (typeof filter.availability === 'boolean') constraints.push(where('availability', '==', filter.availability));
    if (typeof filter.suspended === 'boolean') constraints.push(where('suspended', '==', filter.suspended));
    const snap = await getCountFromServer(query(usersCol(), ...constraints));
    return snap.data().count;
  },

  // CONTRACT §8: suspender = suspended:true + isActive:false. Solo admin.
  async setSuspended(userId: string, suspended: boolean): Promise<void> {
    await updateDoc(doc(getDb(), 'users', userId), {
      suspended,
      isActive: !suspended,
      updatedAt: nowIso(),
    });
  },

  // Dueno o empresa: solo a 'pending'. Aprobar/rechazar es de admin
  // (reviewGuardKyc).
  async setKYCStatus(userId: string, kycStatus: KYCStatus): Promise<void> {
    await updateDoc(doc(getDb(), 'users', userId), {
      kycStatus,
      updatedAt: nowIso(),
    });
  },

  // Solo admin. El motivo del rechazo va al documento privado (lo ve el
  // escolta, su empresa y admin), no al perfil publico.
  async reviewGuardKyc(params: {
    guardId: string;
    decision: 'approved' | 'rejected';
    reviewerId: string;
    reason?: string;
  }): Promise<void> {
    const { guardId, decision, reviewerId, reason } = params;
    const at = nowIso();
    await setDoc(
      kycRef(guardId),
      {
        reviewedAt: at,
        reviewedBy: reviewerId,
        rejectionReason: decision === 'rejected' ? (reason ?? '').trim() || null : null,
        updatedAt: at,
      },
      { merge: true }
    );
    await updateDoc(doc(getDb(), 'users', guardId), { kycStatus: decision, updatedAt: at });
  },

  async getGuardKyc(guardId: string): Promise<GuardKycRecord> {
    const snap = await getDoc(kycRef(guardId));
    return snap.exists() ? (snap.data() as GuardKycRecord) : {};
  },

  // Escritura con merge sobre un solo documento: cada campo se guarda sin
  // pisar los demas.
  async saveGuardKycDocuments(guardId: string, field: KycDocField, urls: string[]): Promise<void> {
    await setDoc(kycRef(guardId), { [field]: urls, updatedAt: nowIso() }, { merge: true });
  },

  // Empresa (sobre SU escolta) o admin: fotos publicas y kycStatus -> 'pending'.
  async updateGuardMedia(
    guardId: string,
    updates: Partial<Record<PublicGuardMediaField, string[]>> & { kycStatus?: 'pending' }
  ): Promise<void> {
    await updateDoc(doc(getDb(), 'users', guardId), {
      ...updates,
      updatedAt: nowIso(),
    });
  },

  // Empresa sobre SU escolta (o admin): tarifa y disponibilidad. Las reglas
  // de la empresa aceptan hourlyRate/availability/updatedAt.
  async updateCompanyGuard(guardId: string, updates: { hourlyRate?: number; availability?: boolean }): Promise<void> {
    await updateDoc(doc(getDb(), 'users', guardId), {
      ...updates,
      updatedAt: nowIso(),
    });
  },

  // Dar de baja a un escolta de la empresa: las reglas solo permiten
  // companyId -> null y updatedAt, nada mas.
  async removeGuardFromCompany(guardId: string): Promise<void> {
    await updateDoc(doc(getDb(), 'users', guardId), {
      companyId: null,
      updatedAt: nowIso(),
    });
    // Y en el espejo de Realtime Database, para que la empresa deje de ver
    // sus reservas. Si falla no se revierte la baja: el perfil ya quedo bien.
    await remove(rtdbRef(getRealtimeDb(), `users/${guardId}/companyId`)).catch(() => {});
  },

  async updateUserFields(
    userId: string,
    updates: Partial<Pick<User, 'firstName' | 'lastName' | 'phone'>> & { hourlyRate?: number }
  ): Promise<void> {
    await updateDoc(doc(getDb(), 'users', userId), {
      ...updates,
      updatedAt: nowIso(),
    });
  },
};
