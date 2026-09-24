/**
 * Booking Service Unit Tests
 * Server-first lifecycle: creation (multi-path write), status machine checks,
 * live index subscriptions and guard-location visibility.
 */

import { bookingService, _shouldShowGuardLocationByRule, type CreateBookingInput } from '@/services/bookingService';
import { ref, push, update, get, onValue } from 'firebase/database';
import { setDoc } from 'firebase/firestore';
import { rateLimitService } from '@/services/rateLimitService';
import type { Booking } from '@/types';

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let mockPushCounter = 0;
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path: path ?? '' })),
  push: jest.fn(() => ({ key: `-Nbooking${++mockPushCounter}` })),
  update: jest.fn(() => Promise.resolve()),
  get: jest.fn(),
  onValue: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'SERVER_TS'),
}));

jest.mock('@/lib/firebase', () => ({
  realtimeDb: jest.fn(() => ({})),
  db: jest.fn(() => ({})),
  auth: jest.fn(() => ({ currentUser: null })),
}));

jest.mock('@/services/rateLimitService', () => ({
  rateLimitService: {
    checkRateLimit: jest.fn(() => Promise.resolve({ allowed: true })),
    getRateLimitError: jest.fn(() => 'Too many attempts'),
    resetRateLimit: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/services/userService', () => ({
  userService: { listGuardsForCompany: jest.fn(() => Promise.resolve([])) },
}));

const mockedUpdate = update as jest.Mock;
const mockedGet = get as jest.Mock;
const mockedOnValue = onValue as jest.Mock;
const mockedSetDoc = setDoc as jest.Mock;

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function createInput(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  const start = new Date(Date.now() + 2 * 60 * 60000);
  return {
    clientId: 'client-123',
    guardId: 'guard-456',
    scheduledDate: formatLocalDate(start),
    scheduledTime: formatLocalTime(start),
    duration: 4,
    vehicleType: 'standard',
    protectionType: 'armed',
    dressCode: 'suit',
    numberOfProtectees: 1,
    numberOfProtectors: 1,
    pickupAddress: '123 Main St',
    pickupLatitude: 19.4326,
    pickupLongitude: -99.1332,
    hourlyRate: 200,
    totalAmount: 1080.2,
    processingFee: 43.2,
    platformCut: 156,
    guardPayout: 884,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-123',
    clientId: 'client-123',
    guardId: 'guard-456',
    scheduledDate: '2024-12-20',
    scheduledTime: '14:00:00',
    duration: 4,
    vehicleType: 'standard',
    protectionType: 'armed',
    dressCode: 'suit',
    numberOfProtectees: 1,
    numberOfProtectors: 1,
    pickupAddress: '123 Main St',
    pickupLatitude: 19.4326,
    pickupLongitude: -99.1332,
    hourlyRate: 200,
    totalAmount: 800,
    processingFee: 23.2,
    platformCut: 80,
    guardPayout: 696.8,
    status: 'pending',
    bookingType: 'scheduled',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Simula un DataSnapshot de RTDB.
function snapshot(value: unknown, key = 'booking-123') {
  return {
    key,
    exists: () => value !== null && value !== undefined,
    val: () => value,
    forEach: (fn: (child: unknown) => void) => {
      Object.entries((value as Record<string, unknown>) ?? {}).forEach(([k, v]) => fn(snapshot(v, k)));
    },
  };
}

function serveBooking(booking: Booking | null) {
  mockedGet.mockResolvedValue(snapshot(booking, booking?.id));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUpdate.mockImplementation(() => Promise.resolve());
});

describe('BookingService - creation', () => {
  it('writes booking, secret and both indexes in ONE multi-path update', async () => {
    const booking = await bookingService.createBooking(createInput());

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    const [target, payload] = mockedUpdate.mock.calls[0];
    expect(target).toEqual({ path: '' }); // raiz
    const id = booking.id;
    expect(payload[`bookings/${id}`]).toMatchObject({ id, status: 'pending', clientId: 'client-123', guardId: 'guard-456', hourlyRate: 200 });
    expect(payload[`bookings/${id}`].startCode).toBeUndefined();
    expect(payload[`bookingSecrets/${id}/startCode`]).toMatch(/^\d{6}$/);
    expect(payload[`clientBookingIndex/client-123/${id}`]).toBe(true);
    expect(payload[`guardBookingIndex/guard-456/${id}`]).toBe(true);
    expect(booking.startCode).toBe(payload[`bookingSecrets/${id}/startCode`]);
  });

  it('uses a push() key, not a timestamp id', async () => {
    const a = await bookingService.createBooking(createInput());
    const b = await bookingService.createBooking(createInput());
    expect(push).toHaveBeenCalled();
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('booking_')).toBe(false);
  });

  it('creates the chat participants doc', async () => {
    const booking = await bookingService.createBooking(createInput());
    expect(mockedSetDoc).toHaveBeenCalledWith(
      { path: `bookingParticipants/${booking.id}` },
      expect.objectContaining({ clientId: 'client-123', guardId: 'guard-456' }),
      { merge: true }
    );
  });

  it('only stores known fields', async () => {
    const input = { ...createInput(), somethingElse: 'x' } as CreateBookingInput;
    const booking = await bookingService.createBooking(input);
    const payload = mockedUpdate.mock.calls[0][1];
    expect(payload[`bookings/${booking.id}`].somethingElse).toBeUndefined();
  });

  it('classifies instant, scheduled and cross-city bookings', async () => {
    const soon = new Date(Date.now() + 20 * 60000);
    const instant = await bookingService.createBooking(
      createInput({ scheduledDate: formatLocalDate(soon), scheduledTime: formatLocalTime(soon) })
    );
    expect(instant.bookingType).toBe('instant');

    const scheduled = await bookingService.createBooking(createInput());
    expect(scheduled.bookingType).toBe('scheduled');

    const crossCity = await bookingService.createBooking(createInput({ pickupCity: 'CDMX', destinationCity: 'Guadalajara' }));
    expect(crossCity.bookingType).toBe('cross-city');
  });

  it('respects the client-side rate limit', async () => {
    (rateLimitService.checkRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false, blockedUntil: Date.now() + 1000 });
    await expect(bookingService.createBooking(createInput())).rejects.toThrow('Too many attempts');
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('rejects incomplete pricing', async () => {
    await expect(bookingService.createBooking(createInput({ hourlyRate: NaN }))).rejects.toThrow(/price/);
  });
});

describe('BookingService - status machine', () => {
  it('accepts a confirmed booking', async () => {
    serveBooking(makeBooking({ status: 'confirmed' }));
    await bookingService.acceptBooking('booking-123');
    const [target, patch] = mockedUpdate.mock.calls[0];
    expect(target).toEqual({ path: 'bookings/booking-123' });
    expect(patch.status).toBe('accepted');
    expect(patch.acceptedAt).toBeDefined();
  });

  it('refuses to accept an unpaid (pending) booking', async () => {
    serveBooking(makeBooking({ status: 'pending' }));
    await expect(bookingService.acceptBooking('booking-123')).rejects.toThrow(/awaiting payment/);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('requires a reason to decline', async () => {
    serveBooking(makeBooking({ status: 'confirmed' }));
    await expect(bookingService.rejectBooking('booking-123', '  ')).rejects.toThrow(/reason/);
    await bookingService.rejectBooking('booking-123', 'Unavailable');
    expect(mockedUpdate.mock.calls[0][1]).toMatchObject({ status: 'rejected', rejectionReason: 'Unavailable' });
  });

  it('starts with the code and maps a rules denial to a friendly error', async () => {
    serveBooking(makeBooking({ status: 'en_route' }));
    await bookingService.startBooking('booking-123', '123456');
    expect(mockedUpdate.mock.calls[0][1]).toMatchObject({ status: 'active', startCodeAttempt: '123456' });

    mockedUpdate.mockRejectedValueOnce(Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' }));
    await expect(bookingService.startBooking('booking-123', '999999')).rejects.toThrow("That code doesn't match");
  });

  it('validates the code format before writing', async () => {
    await expect(bookingService.startBooking('booking-123', '12')).rejects.toThrow(/6-digit/);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('lets the client cancel an accepted booking but not the guard a confirmed one', async () => {
    serveBooking(makeBooking({ status: 'accepted' }));
    await bookingService.cancelBooking('booking-123', 'client', 'Plans changed');
    expect(mockedUpdate.mock.calls[0][1]).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'client',
      cancellationReason: 'Plans changed',
    });

    serveBooking(makeBooking({ status: 'confirmed' }));
    await expect(bookingService.cancelBooking('booking-123', 'guard', 'Sick')).rejects.toThrow(/Can't cancel/);
  });

  it('completes only an active booking', async () => {
    serveBooking(makeBooking({ status: 'accepted' }));
    await expect(bookingService.completeBooking('booking-123')).rejects.toThrow(/Can't complete/);
    serveBooking(makeBooking({ status: 'active' }));
    await bookingService.completeBooking('booking-123');
    expect(mockedUpdate.mock.calls[0][1].status).toBe('completed');
  });

  it('rates once and creates the public review', async () => {
    serveBooking(makeBooking({ status: 'completed' }));
    await bookingService.rateBooking('booking-123', { rating: 5, review: 'Great' });
    expect(mockedUpdate.mock.calls[0][1]).toMatchObject({ rating: 5, review: 'Great' });
    expect(mockedUpdate.mock.calls[0][1].status).toBeUndefined();
    expect(mockedSetDoc).toHaveBeenCalledWith(
      { path: 'reviews/booking-123' },
      expect.objectContaining({ guardId: 'guard-456', bookingId: 'booking-123', clientId: 'client-123', rating: 5, review: 'Great' })
    );

    serveBooking(makeBooking({ status: 'completed', rating: 4 }));
    await expect(bookingService.rateBooking('booking-123', { rating: 5 })).rejects.toThrow(/already rated/);
  });

  it('reassigns a declined booking in one update', async () => {
    serveBooking(makeBooking({ status: 'rejected', rejectionReason: 'Busy' }));
    await bookingService.reassignGuard('booking-123', 'guard-789');
    const payload = mockedUpdate.mock.calls[0][1];
    expect(payload).toEqual({
      'bookings/booking-123/status': 'confirmed',
      'bookings/booking-123/guardId': 'guard-789',
      'bookings/booking-123/rejectedAt': null,
      'bookings/booking-123/rejectionReason': null,
      'guardBookingIndex/guard-789/booking-123': true,
    });
  });

  it('refuses to reassign to the same protector', async () => {
    serveBooking(makeBooking({ status: 'rejected' }));
    await expect(bookingService.reassignGuard('booking-123', 'guard-456')).rejects.toThrow(/choose someone else/);
  });

  it('changes a pending booking only while unpaid', async () => {
    serveBooking(makeBooking({ status: 'pending' }));
    await bookingService.updatePendingBooking('booking-123', { duration: 6, totalAmount: 1500 });
    expect(mockedUpdate.mock.calls[0][1]).toMatchObject({
      'bookings/booking-123/duration': 6,
      'bookings/booking-123/totalAmount': 1500,
    });

    serveBooking(makeBooking({ status: 'confirmed' }));
    await expect(bookingService.updatePendingBooking('booking-123', { duration: 8 })).rejects.toThrow(/can't be changed/);
  });

  it('returns null start code when the secret is unreadable', async () => {
    mockedGet.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(bookingService.getStartCode('booking-123')).resolves.toBeNull();
    mockedGet.mockResolvedValueOnce(snapshot('482913'));
    await expect(bookingService.getStartCode('booking-123')).resolves.toBe('482913');
  });
});

describe('BookingService - live subscriptions', () => {
  it('listens to the index AND each booking, hides unpaid jobs, and unsubscribes via the returned functions', () => {
    const listeners = new Map<string, (snap: unknown) => void>();
    const unsubs = new Map<string, jest.Mock>();
    mockedOnValue.mockImplementation((target: { path: string }, cb: (snap: unknown) => void) => {
      listeners.set(target.path, cb);
      const unsub = jest.fn();
      unsubs.set(target.path, unsub);
      return unsub;
    });

    const received: Booking[][] = [];
    const stop = bookingService.subscribeToGuardBookings('guard-456', (list) => received.push(list));

    listeners.get('guardBookingIndex/guard-456')!(snapshot({ a: true, b: true }));
    expect(listeners.has('bookings/a')).toBe(true);
    expect(listeners.has('bookings/b')).toBe(true);
    expect(received).toHaveLength(0); // espera a que todas respondan

    listeners.get('bookings/a')!(snapshot(makeBooking({ id: 'a', status: 'confirmed' }), 'a'));
    listeners.get('bookings/b')!(snapshot(makeBooking({ id: 'b', status: 'pending' }), 'b'));
    expect(received.at(-1)!.map((b) => b.id)).toEqual(['a']);

    // Cambio de estado en vivo sin volver a leer el indice
    listeners.get('bookings/a')!(snapshot(makeBooking({ id: 'a', status: 'accepted' }), 'a'));
    expect(received.at(-1)![0].status).toBe('accepted');

    // Una reserva sale del indice: se cierra solo su listener
    listeners.get('guardBookingIndex/guard-456')!(snapshot({ a: true }));
    expect(unsubs.get('bookings/b')).toHaveBeenCalled();

    stop();
    expect(unsubs.get('guardBookingIndex/guard-456')).toHaveBeenCalled();
    expect(unsubs.get('bookings/a')).toHaveBeenCalled();
  });

  it('subscribeToBooking reports errors through onError', () => {
    mockedOnValue.mockImplementation((_t: unknown, _cb: unknown, onErr: (e: Error) => void) => {
      onErr(Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }));
      return jest.fn();
    });
    const onError = jest.fn();
    bookingService.subscribeToBooking('booking-123', jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "You don't have access to this booking." }));
  });
});

describe('BookingService - guard location visibility', () => {
  it('is visible while active or en route', () => {
    expect(_shouldShowGuardLocationByRule(makeBooking({ status: 'active' }))).toBe(true);
    expect(_shouldShowGuardLocationByRule(makeBooking({ status: 'en_route' }))).toBe(true);
  });

  it('is visible for an accepted booking within 10 minutes of the start', () => {
    const start = new Date(Date.now() + 8 * 60000);
    const booking = makeBooking({ status: 'accepted', scheduledDate: formatLocalDate(start), scheduledTime: formatLocalTime(start) });
    expect(_shouldShowGuardLocationByRule(booking)).toBe(true);
  });

  it('is hidden for an accepted booking far in the future', () => {
    const start = new Date(Date.now() + 60 * 60000);
    const booking = makeBooking({ status: 'accepted', scheduledDate: formatLocalDate(start), scheduledTime: formatLocalTime(start) });
    expect(_shouldShowGuardLocationByRule(booking)).toBe(false);
  });

  it('is hidden before acceptance and after the service', () => {
    expect(_shouldShowGuardLocationByRule(makeBooking({ status: 'confirmed' }))).toBe(false);
    expect(_shouldShowGuardLocationByRule(makeBooking({ status: 'completed' }))).toBe(false);
  });
});

describe('BookingService - helpers', () => {
  it('labels booking types', () => {
    expect(bookingService.getBookingTypeLabel('instant')).toBe('Instant');
    expect(bookingService.getBookingTypeLabel('scheduled')).toBe('Scheduled');
    expect(bookingService.getBookingTypeLabel('cross-city')).toBe('Cross-city');
  });

  it('calculates minutes until start', () => {
    const start = new Date(Date.now() + 30 * 60000);
    const minutes = bookingService.getMinutesUntilStart(
      makeBooking({ scheduledDate: formatLocalDate(start), scheduledTime: formatLocalTime(start) })
    );
    expect(minutes).toBeGreaterThan(28);
    expect(minutes).toBeLessThan(32);
  });

  it('never calls ref() for the whole bookings list for non-admin subscriptions', () => {
    mockedOnValue.mockImplementation(() => jest.fn());
    const stop = bookingService.subscribeToClientBookings('client-123', jest.fn());
    stop();
    const paths = (ref as jest.Mock).mock.calls.map((c) => c[1]);
    expect(paths).not.toContain('bookings');
  });
});
