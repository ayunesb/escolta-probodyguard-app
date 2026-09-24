import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db as getDb } from '@/lib/firebase';
import type { Guard, Language } from '@/types';
import { logger } from '@/utils/logger';

// Upper bound for the client roster query. Large enough for launch, small
// enough that one screen never downloads the whole user directory.
const ROSTER_LIMIT = 100;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const optNum = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];

// A Firestore Timestamp (serverTimestamp) or an ISO string, as ISO; '' if absent.
const isoDate = (value: unknown): string => {
  if (typeof value === 'string') return value;
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') {
    try {
      return maybe.toDate().toISOString();
    } catch {
      return '';
    }
  }
  return '';
};

/**
 * Turns a Firestore `users/{uid}` guard document into a crash-safe `Guard`
 * WITHOUT inventing anything:
 * - text that is missing stays '' (screens hide empty sections),
 * - arrays default to [],
 * - `hourlyRate`, `rating`, `completedJobs`, `height`, `weight` are 0 when
 *   missing — 0 means "not set" and screens must treat it that way
 *   (`hourlyRate <= 0` = incomplete profile, not bookable),
 * - coordinates stay undefined unless the guard really has them,
 * - `availability` is true only when the document says exactly `true`.
 *
 * KYC document URLs (government ID, licences, vehicle docs, insurance) are
 * NOT exposed: they live in `users/{uid}/private/kyc` (CONTRACT §5).
 */
function normalizeGuard(id: string, data: Record<string, unknown>): Guard {
  const spoken = strings(data.languages) as Language[];
  const uiLanguage = typeof data.language === 'string' ? (data.language as Language) : undefined;
  const hourlyRate = num(data.hourlyRate);

  return {
    id,
    email: str(data.email),
    role: 'guard',
    firstName: str(data.firstName),
    lastName: str(data.lastName),
    phone: str(data.phone),
    language: uiLanguage ?? 'es',
    kycStatus: (data.kycStatus as Guard['kycStatus']) ?? 'pending',
    createdAt: isoDate(data.createdAt),
    isActive: data.isActive !== false && data.suspended !== true,
    emailVerified: data.emailVerified === true,
    updatedAt: isoDate(data.updatedAt),
    bio: str(data.bio),
    height: num(data.height),
    weight: num(data.weight),
    // The profile's own UI language is a language the guard really speaks;
    // it's the only fallback used when no spoken languages were listed.
    languages: spoken.length > 0 ? spoken : uiLanguage ? [uiLanguage] : [],
    hourlyRate: hourlyRate > 0 ? hourlyRate : 0,
    photos: strings(data.photos),
    outfitPhotos: strings(data.outfitPhotos),
    // Moved to users/{uid}/private/kyc — never read from the public profile.
    licenseUrls: [],
    vehicleDocUrls: [],
    insuranceUrls: [],
    certifications: strings(data.certifications),
    rating: num(data.rating),
    ratingBreakdown: (data.ratingBreakdown as Guard['ratingBreakdown']) ?? undefined,
    completedJobs: num(data.completedJobs),
    isFreelancer: typeof data.isFreelancer === 'boolean' ? data.isFreelancer : !data.companyId,
    companyId: typeof data.companyId === 'string' && data.companyId ? data.companyId : undefined,
    availability: data.availability === true,
    latitude: optNum(data.latitude),
    longitude: optNum(data.longitude),
  };
}

/** Has a real hourly rate, so it can be priced and booked. */
export function hasCompleteProfile(guard: Pick<Guard, 'hourlyRate'>): boolean {
  return typeof guard.hourlyRate === 'number' && guard.hourlyRate > 0;
}

/** Real coordinates (not a default city centre). */
export function hasCoordinates<T extends { latitude?: number; longitude?: number }>(
  point: T
): point is T & { latitude: number; longitude: number } {
  return (
    typeof point.latitude === 'number' &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    !(point.latitude === 0 && point.longitude === 0)
  );
}

export const guardService = {
  /**
   * Guards a CLIENT may book: role guard, KYC approved, active, and
   * availability === true. Throws on failure so screens can show an error
   * with a retry instead of an empty roster.
   *
   * Heads-up for dev data: the seed scripts (setup-*.cjs, recreate-guards.cjs)
   * create guards with kycStatus 'approved' but WITHOUT `hourlyRate` and with
   * `availability` as a weekly-schedule object, so none of them qualify. That
   * is intentional (honest data): a guard appears once they have an approved
   * KYC, `availability: true` and a real `hourlyRate`.
   */
  async listAvailableGuards(): Promise<Guard[]> {
    const q = query(
      collection(getDb(), 'users'),
      where('role', '==', 'guard'),
      // KYC gate enforced in the query itself: unverified guards never reach a client.
      where('kycStatus', '==', 'approved'),
      where('availability', '==', true),
      limit(ROSTER_LIMIT)
    );
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map((d) => normalizeGuard(d.id, d.data()))
        .filter((g) => g.isActive && g.availability && g.kycStatus === 'approved');
    } catch (error) {
      logger.error('[GuardService] Failed to list available guards:', error);
      throw error;
    }
  },

  // Same shape for ONE company's team (company dashboards). Keeps the old
  // contract of returning [] on failure because other screens rely on it.
  async listGuardsForCompany(companyId: string): Promise<Guard[]> {
    try {
      const q = query(
        collection(getDb(), 'users'),
        where('role', '==', 'guard'),
        where('companyId', '==', companyId),
        limit(ROSTER_LIMIT)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => normalizeGuard(d.id, d.data()));
    } catch (error) {
      logger.error(`[GuardService] Failed to list guards for company: ${companyId}`, error);
      return [];
    }
  },

  /**
   * One guard by id. Returns null when the user doesn't exist or isn't a
   * guard. On a read failure it returns null too, unless `throwOnError` is
   * set — funnel screens use that to show "couldn't load" + retry instead of
   * "not found".
   */
  async getGuardById(guardId: string, options?: { throwOnError?: boolean }): Promise<Guard | null> {
    try {
      const snapshot = await getDoc(doc(getDb(), 'users', guardId));
      if (!snapshot.exists() || snapshot.data()?.role !== 'guard') return null;
      return normalizeGuard(snapshot.id, snapshot.data());
    } catch (error) {
      logger.error(`[GuardService] Failed to get guard: ${guardId}`, error);
      if (options?.throwOnError) throw error;
      return null;
    }
  },
};
