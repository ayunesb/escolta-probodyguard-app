export type UserRole = 'client' | 'guard' | 'company' | 'admin';

export type Language = 'en' | 'es' | 'fr' | 'de';

export type BookingStatus = 
  | 'pending'
  | 'confirmed'
  | 'accepted' 
  | 'rejected'
  | 'en_route' 
  | 'active' 
  | 'completed' 
  | 'cancelled';

export type VehicleType = 'standard' | 'armored';
export type ProtectionType = 'armed' | 'unarmed';
export type DressCode = 'suit' | 'business_casual' | 'tactical' | 'casual';

export type KYCStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone: string;
  language: Language;
  kycStatus: KYCStatus;
  braintreeCustomerId?: string;
  savedPaymentMethods?: SavedPaymentMethod[];
  createdAt: string;
  isActive: boolean;
  emailVerified: boolean;
  updatedAt: string;
}

export interface Client extends User {
  role: 'client';
  governmentIdUrl?: string;
}

export interface Guard extends User {
  role: 'guard';
  bio: string;
  height: number;
  weight: number;
  languages: Language[];
  hourlyRate: number;
  photos: string[];
  outfitPhotos: string[];
  governmentIdUrls?: string[];
  // Documentos KYC: viven en users/{uid}/private/kyc, no en el perfil publico.
  licenseUrls?: string[];
  vehicleDocUrls?: string[];
  insuranceUrls?: string[];
  certifications: string[];
  rating: number;
  ratingBreakdown?: RatingBreakdown;
  completedJobs: number;
  isFreelancer: boolean;
  companyId?: string;
  availability: boolean;
  latitude?: number;
  longitude?: number;
}

export interface Company extends User {
  role: 'company';
  companyName: string;
  businessLicenseUrl?: string;
  guards: string[];
  handlesPayouts: boolean;
}

export interface Admin extends User {
  role: 'admin';
}

export interface RatingBreakdown {
  professionalism: number;
  punctuality: number;
  communication: number;
  languageClarity: number;
}

export interface RouteStop {
  address: string;
  latitude: number;
  longitude: number;
  order: number;
}

export type BookingType = 'instant' | 'scheduled' | 'cross-city';

export interface Booking {
  id: string;
  clientId: string;
  guardId?: string;
  companyId?: string;
  status: BookingStatus;
  bookingType: BookingType;
  vehicleType: VehicleType;
  protectionType: ProtectionType;
  dressCode: DressCode;
  numberOfProtectees: number;
  numberOfProtectors: number;
  scheduledDate: string;
  scheduledTime: string;
  duration: number;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupCity?: string;
  destinationAddress?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  destinationCity?: string;
  routeStops?: RouteStop[];
  // The start code is NOT stored on the booking node: it lives in
  // bookingSecrets/{id}/startCode (client + admin only). createBooking returns
  // it on the object it hands back to the creating client; reads never have it.
  startCode?: string;
  // Written by the guard when starting the service; RTDB rules check it
  // against bookingSecrets/{id}/startCode.
  startCodeAttempt?: string;
  // Guard's hourly rate (MXN) used to price the booking. Always written by
  // createBooking; optional only so legacy/mock objects still type-check.
  hourlyRate?: number;
  totalAmount: number;
  processingFee: number;
  platformCut: number;
  guardPayout: number;
  transactionId?: string;
  paymentStatus?: 'paid' | 'refunded';
  paymentIntentId?: string;
  createdAt: string;
  confirmedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: 'client' | 'guard';
  cancellationReason?: string;
  rating?: number;
  ratingBreakdown?: RatingBreakdown;
  review?: string;
  clientRating?: number;
  clientReview?: string;
  extensionCount?: number;
  originalDuration?: number;
  // helper fields used in some contexts
  isScheduled?: boolean;
  isCrossCity?: boolean;
  estimatedArrivalTime?: string;
}

export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderRole: UserRole;
  text: string;
  originalLanguage: Language;
  translatedText?: string;
  translatedLanguage?: Language;
  timestamp: string;
}

export interface SavedPaymentMethod {
  token: string;
  last4: string;
  cardType: string;
  expirationMonth: string;
  expirationYear: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  clientId: string;
  guardId: string;
  amount: number;
  processingFee: number;
  platformCut: number;
  guardPayout: number;
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  braintreeTransactionId: string;
  refundId?: string;
  refundedAt?: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  guardId: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bookingIds: string[];
  braintreePayoutId?: string;
  failureReason?: string;
  createdAt: string;
  processedAt?: string;
}

export interface LedgerEntry {
  id: string;
  guardId: string;
  bookingId: string;
  type: 'earning' | 'payout' | 'adjustment';
  amount: number;
  description: string;
  createdAt: string;
}

export interface GuardBalance {
  guardId: string;
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
  totalPayouts: number;
  lastPayoutAt?: string;
}

export interface Transaction {
  id: string;
  type: 'payment' | 'refund' | 'payout';
  amount: number;
  currency: 'MXN';
  status: 'pending' | 'completed' | 'failed';
  userId: string;
  bookingId?: string;
  paymentId?: string;
  payoutId?: string;
  braintreeId: string;
  metadata?: Record<string, any>;
  createdAt: string;
  completedAt?: string;
}

export interface Document {
  id: string;
  userId: string;
  type: 'government_id' | 'license' | 'vehicle_doc' | 'insurance' | 'business_license';
  url: string;
  status: KYCStatus;
  uploadedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Refund {
  id: string;
  paymentId: string;
  bookingId: string;
  amount: number;
  reason?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  processedAt?: string;
  requestedBy?: string;
  processedBy?: string;
  completedAt?: string;
}

export interface GuardReassignment {
  id: string;
  bookingId: string;
  fromGuardId?: string;
  toGuardId?: string;
  originalGuardId?: string;
  newGuardId?: string;
  reason?: string;
  status?: string;
  requestedAt: string;
  completedAt?: string;
}

export interface CompanySettings {
  id?: string;
  companyId: string;
  timezone?: string;
  currency?: string;
  handlesPayouts?: boolean;
  defaultHourlyRate?: number;
  payoutMethod?: string;
}
