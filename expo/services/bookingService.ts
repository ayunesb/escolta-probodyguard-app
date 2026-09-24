// Ciclo de vida de una reserva en Realtime Database.
//
// El servidor es la unica fuente de verdad: aqui no hay copia en
// AsyncStorage. Cada transicion lee el estado actual, comprueba que el paso
// esta permitido (CONTRACT §3) y escribe solo los campos de ese paso. Las
// reglas de RTDB vuelven a validar todo; lo de aqui es para dar un error claro
// antes de chocar con un "permission denied" opaco.
//
// Listeners: siempre se cancelan con la funcion que devuelve onValue. Un
// `off(ref)` sin callback mata TODOS los listeners de esa ruta, incluidos los
// de otras pantallas montadas.
import { ref, push, update, get, onValue, type DataSnapshot } from 'firebase/database';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { realtimeDb as getRealtimeDb, db as getFirestoreDb, auth as getAuth } from '@/lib/firebase';
import type { Booking, BookingStatus, BookingType, RatingBreakdown } from '@/types';
import { rateLimitService } from './rateLimitService';
import { userService } from './userService';
import { logger } from '@/utils/logger';
import i18n from '@/i18n';

export type BookingListener = (bookings: Booking[]) => void;
export type BookingErrorListener = (error: Error) => void;

// Lo que el cliente aporta al crear la reserva. El resto (id, status,
// bookingType, createdAt) lo pone createBooking.
export type CreateBookingInput = Pick<
  Booking,
  | 'clientId'
  | 'companyId'
  | 'vehicleType'
  | 'protectionType'
  | 'dressCode'
  | 'numberOfProtectees'
  | 'numberOfProtectors'
  | 'scheduledDate'
  | 'scheduledTime'
  | 'duration'
  | 'pickupAddress'
  | 'pickupLatitude'
  | 'pickupLongitude'
  | 'pickupCity'
  | 'destinationAddress'
  | 'destinationLatitude'
  | 'destinationLongitude'
  | 'destinationCity'
  | 'routeStops'
  | 'totalAmount'
  | 'processingFee'
  | 'platformCut'
  | 'guardPayout'
> & {
  guardId: string;
  hourlyRate: number;
};

export interface RateBookingInput {
  rating: number;
  ratingBreakdown?: RatingBreakdown | null;
  review?: string;
}

// Solo estas claves llegan al nodo: si la pantalla pasa su estado de
// formulario completo, lo demas se ignora en vez de ensuciar la reserva.
const CREATE_KEYS: readonly (keyof CreateBookingInput)[] = [
  'clientId',
  'guardId',
  'companyId',
  'vehicleType',
  'protectionType',
  'dressCode',
  'numberOfProtectees',
  'numberOfProtectors',
  'scheduledDate',
  'scheduledTime',
  'duration',
  'pickupAddress',
  'pickupLatitude',
  'pickupLongitude',
  'pickupCity',
  'destinationAddress',
  'destinationLatitude',
  'destinationLongitude',
  'destinationCity',
  'routeStops',
  'hourlyRate',
  'totalAmount',
  'processingFee',
  'platformCut',
  'guardPayout',
];

const SLOW_CONNECTION_MS = 10000;

// Estados en los que el escolta esta trabajando la reserva.
export const LIVE_BOOKING_STATUSES: readonly BookingStatus[] = ['accepted', 'en_route', 'active'];

export const isLiveStatus = (status?: BookingStatus | string): boolean =>
  LIVE_BOOKING_STATUSES.includes(status as BookingStatus);

const KNOWN_STATUSES: readonly BookingStatus[] = [
  'pending',
  'confirmed',
  'accepted',
  'rejected',
  'en_route',
  'active',
  'completed',
  'cancelled',
];

// Frase del estado para los mensajes de error, en el idioma activo
// ("still awaiting payment" / "aun esta pendiente de pago").
const describeStatus = (status?: string): string =>
  KNOWN_STATUSES.includes(status as BookingStatus)
    ? i18n.t(`booking:errors.statusPhrase.${status as BookingStatus}`)
    : i18n.t('booking:errors.statusPhrase.unexpected', { status: status ?? 'unknown' });

// Verbo de cada transicion (clave de booking:errors.verbs). Tambien sirve de
// etiqueta en los logs.
type TransitionVerb =
  | 'accept'
  | 'decline'
  | 'markEnRoute'
  | 'start'
  | 'complete'
  | 'cancel'
  | 'rate'
  | 'change'
  | 'reassign';

const verbText = (verb: TransitionVerb): string => i18n.t(`booking:errors.verbs.${verb}`);

// ---------------------------------------------------------------------------
// Utilidades internas

function db() {
  return getRealtimeDb();
}

function currentUid(): string | null {
  try {
    return getAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function generateStartCode(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return String(100000 + (buf[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

function scheduledDateTime(scheduledDate?: string, scheduledTime?: string): Date | null {
  if (!scheduledDate || !scheduledTime) return null;
  const d = new Date(`${scheduledDate}T${scheduledTime}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function determineBookingType(
  scheduledDate: string,
  scheduledTime: string,
  pickupCity?: string,
  destinationCity?: string
): BookingType {
  if (pickupCity && destinationCity && pickupCity.trim().toLowerCase() !== destinationCity.trim().toLowerCase()) {
    return 'cross-city';
  }
  const start = scheduledDateTime(scheduledDate, scheduledTime);
  if (start && (start.getTime() - Date.now()) / 60000 <= 30) return 'instant';
  return 'scheduled';
}

// RTDB rechaza `undefined`; JSON lo elimina de objetos (y deja datos planos).
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pickCreateFields(input: Partial<CreateBookingInput>): Partial<CreateBookingInput> {
  const out: Partial<CreateBookingInput> = {};
  for (const key of CREATE_KEYS) {
    if (input[key] !== undefined) {
      (out as Record<string, unknown>)[key] = input[key];
    }
  }
  return out;
}

function normalize(snap: DataSnapshot): Booking {
  return { ...(snap.val() as Booking), id: snap.key as string };
}

const newestFirst = (a: Booking, b: Booking) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

function isPermissionDenied(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = String(e?.code ?? '').toLowerCase();
  const message = String(e?.message ?? '').toLowerCase();
  return code.includes('permission') || message.includes('permission_denied') || message.includes('permission denied');
}

// Convierte un fallo de escritura en un mensaje que se puede mostrar tal cual.
function friendlyWriteError(error: unknown, deniedMessage: string): Error {
  if (isPermissionDenied(error)) return new Error(deniedMessage);
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  if (/network|offline|unavailable|disconnect/i.test(message)) {
    return new Error(i18n.t('common:errors.network'));
  }
  return new Error(i18n.t('common:errors.generic'));
}

async function readBooking(bookingId: string): Promise<Booking> {
  let snap: DataSnapshot;
  try {
    snap = await get(ref(db(), `bookings/${bookingId}`));
  } catch (error) {
    logger.error('[Booking] Read failed', { bookingId, error });
    throw friendlyWriteError(error, i18n.t('booking:errors.noAccess'));
  }
  if (!snap.exists()) throw new Error(i18n.t('booking:errors.gone'));
  return normalize(snap);
}

type Actor = 'client' | 'guard' | 'participant';

function assertActor(booking: Booking, actor: Actor, verb: TransitionVerb): void {
  const uid = currentUid();
  if (!uid) return; // sin sesion conocida (tests, arranque): deciden las reglas
  const isClient = booking.clientId === uid;
  const isGuard = !!booking.guardId && booking.guardId === uid;
  const ok = actor === 'client' ? isClient : actor === 'guard' ? isGuard : isClient || isGuard;
  if (!ok) {
    const key =
      actor === 'guard' ? 'booking:errors.onlyGuard' : actor === 'client' ? 'booking:errors.onlyClient' : 'booking:errors.onlyParticipant';
    throw new Error(i18n.t(key, { verb: verbText(verb) }));
  }
}

interface TransitionSpec {
  from: readonly BookingStatus[];
  to?: BookingStatus;
  actor: Actor;
  verb: TransitionVerb; // "accept", "decline"... para los mensajes
  patch?: Record<string, unknown>;
  deniedMessage?: string;
  // Comprobaciones extra sobre el estado leido; lanzan Error si no procede.
  check?: (current: Booking) => void;
}

async function transition(bookingId: string, spec: TransitionSpec): Promise<Booking> {
  const current = await readBooking(bookingId);
  if (!spec.from.includes(current.status)) {
    throw new Error(
      i18n.t('booking:errors.cantTransition', { verb: verbText(spec.verb), status: describeStatus(current.status) })
    );
  }
  spec.check?.(current);
  assertActor(current, spec.actor, spec.verb);

  const patch: Record<string, unknown> = { ...(spec.patch ?? {}) };
  if (spec.to) patch.status = spec.to;

  try {
    await update(ref(db(), `bookings/${bookingId}`), stripUndefined(patch));
  } catch (error) {
    logger.error(`[Booking] ${spec.verb} failed`, { bookingId, error });
    throw friendlyWriteError(error, spec.deniedMessage ?? i18n.t('booking:errors.cantUpdateNow'));
  }
  return { ...current, ...(patch as Partial<Booking>) };
}

// Participantes del chat en Firestore (CONTRACT §8). Un fallo aqui no
// invalida la reserva, pero deja el chat sin permisos: se reintenta una vez.
async function writeParticipants(bookingId: string, clientId: string, guardId: string): Promise<void> {
  const participantsRef = doc(getFirestoreDb(), 'bookingParticipants', bookingId);
  const data = { clientId, guardId, updatedAt: serverTimestamp() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await setDoc(participantsRef, data, { merge: true });
      return;
    } catch (error) {
      if (attempt === 1) {
        logger.error('[Booking] Could not write chat participants', { bookingId, error });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Suscripciones

// Escucha un indice {indexPath}/{ownerId} y, ademas, CADA reserva que
// contiene, asi que un cambio de estado (aceptar, rechazar...) llega en vivo
// sin remontar la pantalla. Solo abre listeners para IDs nuevos y cierra los
// que desaparecen del indice: nada de volver a descargar todo en cada cambio.
function subscribeViaIndex(
  indexPath: string,
  ownerId: string,
  onChange: BookingListener,
  onError?: BookingErrorListener,
  keep?: (booking: Booking) => boolean
): () => void {
  const database = db();
  const bookingUnsubs = new Map<string, () => void>();
  const bookings = new Map<string, Booking>();
  const settled = new Set<string>();
  let indexReady = false;
  let closed = false;
  // Sin conexion (y sin cache) RTDB no responde nunca: tras unos segundos se
  // avisa y se muestra lo que haya, sin dejar de escuchar.
  let patient = true;
  const slowTimer = setTimeout(() => {
    patient = false;
    if (closed) return;
    if (!indexReady) {
      if (onError) onError(new Error(i18n.t('booking:shared.stillConnecting')));
    } else {
      emit();
    }
  }, SLOW_CONNECTION_MS);

  const emit = () => {
    if (closed || !indexReady) return;
    // Espera a que cada reserva haya respondido una vez: evita que la lista
    // aparezca a trozos (salvo que la conexion vaya lenta).
    for (const id of bookingUnsubs.keys()) {
      if (patient && !settled.has(id)) return;
    }
    const list = Array.from(bookings.values()).filter((b) => (keep ? keep(b) : true));
    list.sort(newestFirst);
    onChange(list);
  };

  const watch = (id: string) => {
    const unsub = onValue(
      ref(database, `bookings/${id}`),
      (snap) => {
        settled.add(id);
        if (snap.exists()) bookings.set(id, normalize(snap));
        else bookings.delete(id);
        emit();
      },
      (error) => {
        // Esperado cuando la reserva se reasigno a otro escolta: las reglas
        // ya no le dejan leerla. Se quita de la lista y listo.
        logger.log('[Booking] Indexed booking not readable', { id, message: error?.message });
        settled.add(id);
        bookings.delete(id);
        emit();
      }
    );
    bookingUnsubs.set(id, unsub);
  };

  const unsubIndex = onValue(
    ref(database, `${indexPath}/${ownerId}`),
    (snap) => {
      const ids = new Set<string>(snap.exists() ? Object.keys(snap.val() ?? {}) : []);
      for (const [id, unsub] of Array.from(bookingUnsubs.entries())) {
        if (!ids.has(id)) {
          unsub();
          bookingUnsubs.delete(id);
          bookings.delete(id);
          settled.delete(id);
        }
      }
      ids.forEach((id) => {
        if (!bookingUnsubs.has(id)) watch(id);
      });
      indexReady = true;
      emit();
    },
    (error) => {
      logger.error(`[Booking] ${indexPath} subscription failed`, { ownerId, error });
      if (onError) onError(new Error(i18n.t('booking:errors.loadYours')));
      else onChange([]);
    }
  );

  return () => {
    closed = true;
    clearTimeout(slowTimer);
    unsubIndex();
    bookingUnsubs.forEach((unsub) => unsub());
    bookingUnsubs.clear();
    bookings.clear();
    settled.clear();
  };
}

// ---------------------------------------------------------------------------
// Reglas de visibilidad de la ubicacion del escolta

function minutesUntilStart(booking: Pick<Booking, 'scheduledDate' | 'scheduledTime'>, now: Date = new Date()): number | null {
  const start = scheduledDateTime(booking.scheduledDate, booking.scheduledTime);
  if (!start) return null;
  return (start.getTime() - now.getTime()) / 60000;
}

// Cuando se comparte (y se muestra) la ubicacion en vivo del escolta:
// - active / en_route: siempre (el escolta dijo "voy en camino").
// - accepted: desde 10 minutos antes de la hora programada (regla T-10),
//   para no exponer al escolta horas antes del servicio.
// El escolta solo publica cuando esto es cierto, asi que lo publicado y lo
// visible coinciden.
export function _shouldShowGuardLocationByRule(booking: Booking, now: Date = new Date()): boolean {
  if (booking.status === 'active' || booking.status === 'en_route') return true;
  if (booking.status !== 'accepted') return false;
  const minutes = minutesUntilStart(booking, now);
  return minutes !== null && minutes <= 10;
}

// ---------------------------------------------------------------------------

export const bookingService = {
  // ---- Lectura ------------------------------------------------------------

  async getBookingById(id: string): Promise<Booking | null> {
    try {
      const snap = await get(ref(db(), `bookings/${id}`));
      return snap.exists() ? normalize(snap) : null;
    } catch (error) {
      logger.error('[Booking] getBookingById failed', { id, error });
      return null;
    }
  },

  subscribeToBooking(
    bookingId: string,
    callback: (booking: Booking | null) => void,
    onError?: BookingErrorListener
  ): () => void {
    return onValue(
      ref(db(), `bookings/${bookingId}`),
      (snap) => callback(snap.exists() ? normalize(snap) : null),
      (error) => {
        logger.error('[Booking] subscribeToBooking failed', { bookingId, error });
        if (onError) {
          onError(
            isPermissionDenied(error)
              ? new Error(i18n.t('booking:errors.noAccess'))
              : new Error(i18n.t('booking:errors.loadOne'))
          );
        } else {
          callback(null);
        }
      }
    );
  },

  // Lista completa: solo la puede leer un admin (reglas de RTDB).
  subscribeToBookings(callback: BookingListener, onError?: BookingErrorListener): () => void {
    return onValue(
      ref(db(), 'bookings'),
      (snap) => {
        const list: Booking[] = [];
        snap.forEach((child) => {
          list.push(normalize(child));
        });
        list.sort(newestFirst);
        callback(list);
      },
      (error) => {
        logger.error('[Booking] subscribeToBookings failed', { error });
        if (onError) onError(new Error(i18n.t('booking:errors.loadAll')));
        else callback([]);
      }
    );
  },

  // Trabajos del escolta. Nunca incluye reservas 'pending' (sin pagar).
  subscribeToGuardBookings(guardId: string, callback: BookingListener, onError?: BookingErrorListener): () => void {
    return subscribeViaIndex(
      'guardBookingIndex',
      guardId,
      callback,
      onError,
      (b) => b.status !== 'pending' && b.guardId === guardId
    );
  },

  subscribeToClientBookings(clientId: string, callback: BookingListener, onError?: BookingErrorListener): () => void {
    return subscribeViaIndex('clientBookingIndex', clientId, callback, onError, (b) => b.clientId === clientId);
  },

  // Una empresa no tiene indice propio: se unen los indices de sus escoltas.
  subscribeToCompanyBookings(companyId: string, callback: BookingListener, onError?: BookingErrorListener): () => void {
    let cancelled = false;
    let unsubs: (() => void)[] = [];

    userService
      .listGuardsForCompany(companyId)
      .then((guards) => {
        if (cancelled) return;
        if (guards.length === 0) {
          callback([]);
          return;
        }
        const perGuard = new Map<string, Booking[]>();
        const emit = () => {
          if (cancelled || perGuard.size < guards.length) return;
          const byId = new Map<string, Booking>();
          perGuard.forEach((list) => list.forEach((b) => byId.set(b.id, b)));
          callback(Array.from(byId.values()).sort(newestFirst));
        };
        unsubs = guards.map((g) =>
          subscribeViaIndex(
            'guardBookingIndex',
            g.id,
            (list) => {
              perGuard.set(g.id, list);
              emit();
            },
            () => {
              perGuard.set(g.id, []);
              emit();
            },
            (b) => b.status !== 'pending'
          )
        );
      })
      .catch((error) => {
        logger.error('[Booking] Failed to load company guards', { companyId, error });
        if (onError) onError(new Error(i18n.t('booking:errors.loadTeam')));
        else callback([]);
      });

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
      unsubs = [];
    };
  },

  // Compatibilidad (app/booking/pending.tsx): solicitudes que esperan
  // respuesta del escolta. Tras el pago eso es 'confirmed', nunca 'pending'.
  async getPendingBookingsForGuard(guardId: string): Promise<Booking[]> {
    try {
      const indexSnap = await get(ref(db(), `guardBookingIndex/${guardId}`));
      const ids = indexSnap.exists() ? Object.keys(indexSnap.val() ?? {}) : [];
      const results = await Promise.all(ids.map((id) => this.getBookingById(id)));
      return results
        .filter((b): b is Booking => !!b && b.status === 'confirmed' && b.guardId === guardId)
        .sort(newestFirst);
    } catch (error) {
      logger.error('[Booking] getPendingBookingsForGuard failed', { guardId, error });
      return [];
    }
  },

  // Solo el cliente de la reserva (y admins) puede leer el codigo.
  async getStartCode(bookingId: string): Promise<string | null> {
    try {
      const snap = await get(ref(db(), `bookingSecrets/${bookingId}/startCode`));
      const value = snap.val();
      return value === null || value === undefined ? null : String(value);
    } catch (error) {
      logger.error('[Booking] getStartCode failed', { bookingId, error });
      return null;
    }
  },

  // ---- Creacion (cliente) --------------------------------------------------

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    if (!input?.clientId) throw new Error(i18n.t('booking:errors.signInToBook'));
    if (!input.guardId) throw new Error(i18n.t('booking:errors.chooseProtectorFirst'));
    const uid = currentUid();
    if (uid && uid !== input.clientId) throw new Error(i18n.t('booking:errors.ownAccountOnly'));
    for (const key of ['hourlyRate', 'totalAmount', 'processingFee', 'platformCut', 'guardPayout'] as const) {
      if (!Number.isFinite(input[key])) throw new Error(i18n.t('booking:errors.priceIncomplete'));
    }

    const rateLimit = await rateLimitService.checkRateLimit('booking', input.clientId);
    if (!rateLimit.allowed) {
      throw new Error(rateLimitService.getRateLimitError('booking', rateLimit.blockedUntil ?? Date.now()));
    }

    const database = db();
    const id = push(ref(database, 'bookings')).key;
    if (!id) throw new Error(i18n.t('common:errors.generic'));
    const startCode = generateStartCode();

    const node = stripUndefined({
      ...pickCreateFields(input),
      id,
      status: 'pending' as BookingStatus,
      bookingType: determineBookingType(input.scheduledDate, input.scheduledTime, input.pickupCity, input.destinationCity),
      createdAt: new Date().toISOString(),
    }) as Booking;

    try {
      await update(ref(database), {
        [`bookings/${id}`]: node,
        [`bookingSecrets/${id}/startCode`]: startCode,
        [`clientBookingIndex/${input.clientId}/${id}`]: true,
        [`guardBookingIndex/${input.guardId}/${id}`]: true,
      });
    } catch (error) {
      logger.error('[Booking] createBooking failed', { error });
      throw friendlyWriteError(error, i18n.t('booking:errors.saveFailed'));
    }

    await writeParticipants(id, input.clientId, input.guardId);

    // startCode solo viaja en el objeto devuelto al cliente que la creo.
    return { ...node, startCode };
  },

  // Mientras no se haya pagado, el cliente puede cambiar opciones (reintento
  // de pago tras cambiar duracion, horario o escolta).
  async updatePendingBooking(bookingId: string, patch: Partial<CreateBookingInput>): Promise<void> {
    const current = await readBooking(bookingId);
    if (current.status !== 'pending') {
      throw new Error(i18n.t('booking:errors.cantChange', { status: describeStatus(current.status) }));
    }
    assertActor(current, 'client', 'change');

    const fields = pickCreateFields(patch);
    delete fields.clientId; // inmutable
    const next = { ...current, ...fields };
    const changes: Record<string, unknown> = { ...fields };
    if (
      fields.scheduledDate !== undefined ||
      fields.scheduledTime !== undefined ||
      fields.pickupCity !== undefined ||
      fields.destinationCity !== undefined
    ) {
      changes.bookingType = determineBookingType(next.scheduledDate, next.scheduledTime, next.pickupCity, next.destinationCity);
    }
    if (Object.keys(changes).length === 0) return;

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(stripUndefined(changes))) {
      updates[`bookings/${bookingId}/${key}`] = value;
    }
    const guardChanged = !!fields.guardId && fields.guardId !== current.guardId;
    if (guardChanged) updates[`guardBookingIndex/${fields.guardId}/${bookingId}`] = true;

    try {
      await update(ref(db()), updates);
    } catch (error) {
      logger.error('[Booking] updatePendingBooking failed', { bookingId, error });
      throw friendlyWriteError(error, i18n.t('booking:errors.updateFailed'));
    }
    if (guardChanged && fields.guardId) {
      await writeParticipants(bookingId, current.clientId, fields.guardId);
    }
  },

  // rejected -> confirmed con otro escolta. Los importes no cambian.
  async reassignGuard(bookingId: string, newGuardId: string): Promise<void> {
    if (!newGuardId) throw new Error(i18n.t('booking:errors.chooseProtector'));
    const current = await readBooking(bookingId);
    if (current.paymentStatus === 'refunded') throw new Error(i18n.t('booking:errors.refundedBooking'));
    if (current.status !== 'rejected') {
      throw new Error(i18n.t('booking:errors.cantReassign', { status: describeStatus(current.status) }));
    }
    assertActor(current, 'client', 'reassign');
    if (current.guardId === newGuardId) {
      throw new Error(i18n.t('booking:errors.alreadyDeclined'));
    }

    try {
      await update(ref(db()), {
        [`bookings/${bookingId}/status`]: 'confirmed',
        [`bookings/${bookingId}/guardId`]: newGuardId,
        [`bookings/${bookingId}/rejectedAt`]: null,
        [`bookings/${bookingId}/rejectionReason`]: null,
        [`guardBookingIndex/${newGuardId}/${bookingId}`]: true,
      });
    } catch (error) {
      logger.error('[Booking] reassignGuard failed', { bookingId, error });
      throw friendlyWriteError(error, i18n.t('booking:errors.assignFailed'));
    }
    await writeParticipants(bookingId, current.clientId, newGuardId);
  },

  // ---- Transiciones --------------------------------------------------------

  // `guardId` se acepta por compatibilidad; si viene, debe ser el asignado.
  async acceptBooking(bookingId: string, guardId?: string): Promise<void> {
    await transition(bookingId, {
      from: ['confirmed'],
      to: 'accepted',
      actor: 'guard',
      verb: 'accept',
      patch: { acceptedAt: new Date().toISOString() },
      check: (current) => {
        if (guardId && current.guardId !== guardId) throw new Error(i18n.t('booking:errors.otherProtector'));
      },
    });
  },

  async rejectBooking(bookingId: string, reason: string): Promise<void> {
    const trimmed = (reason ?? '').trim();
    if (!trimmed) throw new Error(i18n.t('booking:errors.declineReason'));
    await transition(bookingId, {
      from: ['confirmed'],
      to: 'rejected',
      actor: 'guard',
      verb: 'decline',
      patch: { rejectedAt: new Date().toISOString(), rejectionReason: trimmed.slice(0, 500) },
    });
  },

  async markEnRoute(bookingId: string): Promise<void> {
    await transition(bookingId, {
      from: ['accepted'],
      to: 'en_route',
      actor: 'guard',
      verb: 'markEnRoute',
    });
  },

  // El escolta escribe el codigo que le dicta el cliente; las reglas lo
  // comparan con bookingSecrets/{id}/startCode.
  async startBooking(bookingId: string, code: string): Promise<void> {
    const clean = (code ?? '').replace(/\D/g, '');
    if (clean.length !== 6) throw new Error(i18n.t('booking:errors.codeLength'));

    const limiterKey = `${bookingId}_${currentUid() ?? 'guard'}`;
    const limit = await rateLimitService.checkRateLimit('startCode', limiterKey);
    if (!limit.allowed) {
      throw new Error(rateLimitService.getRateLimitError('startCode', limit.blockedUntil ?? Date.now()));
    }

    await transition(bookingId, {
      from: ['accepted', 'en_route'],
      to: 'active',
      actor: 'guard',
      verb: 'start',
      patch: { startedAt: new Date().toISOString(), startCodeAttempt: clean },
      deniedMessage: i18n.t('booking:errors.codeMismatch'),
    });

    try {
      await rateLimitService.resetRateLimit('startCode', limiterKey);
    } catch {
      // no critico
    }
  },

  async completeBooking(bookingId: string): Promise<void> {
    await transition(bookingId, {
      from: ['active'],
      to: 'completed',
      actor: 'participant',
      verb: 'complete',
      patch: { completedAt: new Date().toISOString() },
    });
  },

  async cancelBooking(bookingId: string, by: 'client' | 'guard', reason: string): Promise<void> {
    const trimmed = (reason ?? '').trim();
    if (!trimmed) throw new Error(i18n.t('booking:errors.cancelReason'));
    await transition(bookingId, {
      from: by === 'client' ? ['pending', 'confirmed', 'accepted', 'rejected'] : ['accepted', 'en_route'],
      to: 'cancelled',
      actor: by,
      verb: 'cancel',
      check: (current) => {
        if (current.paymentStatus === 'refunded') throw new Error(i18n.t('booking:errors.refundedBooking'));
      },
      patch: {
        cancelledAt: new Date().toISOString(),
        cancelledBy: by,
        cancellationReason: trimmed.slice(0, 500),
      },
    });
  },

  // Una sola vez, solo el cliente, solo completada. Ademas deja la resena
  // publica en Firestore (reviews/{bookingId}) para el perfil del escolta.
  async rateBooking(bookingId: string, input: RateBookingInput): Promise<void> {
    const rating = Number(input?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error(i18n.t('booking:errors.ratingRange'));
    const breakdown = input.ratingBreakdown ?? undefined;
    if (breakdown) {
      const values = [breakdown.professionalism, breakdown.punctuality, breakdown.communication, breakdown.languageClarity];
      if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) {
        throw new Error(i18n.t('booking:errors.categoryRange'));
      }
    }
    const review = (input.review ?? '').trim().slice(0, 1000);

    const current = await transition(bookingId, {
      from: ['completed'],
      actor: 'client',
      verb: 'rate',
      patch: { rating, ratingBreakdown: breakdown, review: review || undefined },
      deniedMessage: i18n.t('booking:errors.alreadyRatedDenied'),
      check: (b) => {
        if (typeof b.rating === 'number') throw new Error(i18n.t('booking:errors.alreadyRated'));
      },
    });

    if (!current.guardId) return;
    try {
      await setDoc(doc(getFirestoreDb(), 'reviews', bookingId), {
        guardId: current.guardId,
        bookingId,
        clientId: current.clientId,
        rating,
        ...(breakdown ? { ratingBreakdown: breakdown } : {}),
        review,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      // La calificacion ya quedo en la reserva; la resena publica es aparte.
      logger.error('[Booking] Could not create public review', { bookingId, error });
    }
  },

  // ---- Ayudas de presentacion ---------------------------------------------

  shouldShowGuardLocation(booking: Booking): boolean {
    return _shouldShowGuardLocationByRule(booking);
  },

  getMinutesUntilStart(booking: Booking): number {
    const minutes = minutesUntilStart(booking);
    return minutes === null ? 0 : Math.max(0, Math.floor(minutes));
  },

  getBookingTypeLabel(bookingType: BookingType): string {
    switch (bookingType) {
      case 'instant':
        return i18n.t('booking:bookingType.instant');
      case 'scheduled':
        return i18n.t('booking:bookingType.scheduled');
      case 'cross-city':
        return i18n.t('booking:bookingType.crossCity');
      default:
        return i18n.t('booking:bookingType.unknown');
    }
  },
};
