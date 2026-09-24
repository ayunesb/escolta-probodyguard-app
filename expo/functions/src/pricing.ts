// COPIA de utils/pricing.ts (la app). functions/ es un paquete aparte y no
// puede importar fuera de su carpeta al desplegarse, asi que el calculo se
// duplica aqui. Si cambias uno, cambia el otro: el servidor cobra con ESTE
// y la app muestra el de utils/pricing.ts.
//
export const PRICING = {
  // Stripe Mexico, tarjetas nacionales: 3.6% + $3.00 MXN (verificado 2026-09-14)
  PROCESSING_FEE_PERCENT: 0.036,
  PROCESSING_FEE_FIXED_CENTS: 300,
  PLATFORM_CUT_PERCENT: 0.15,
  ARMORED_VEHICLE_MULTIPLIER: 1.5,
  ARMED_PROTECTION_MULTIPLIER: 1.3,
  MIN_DURATION_HOURS: 1,
  MAX_DURATION_HOURS: 24,
  MIN_PROTECTORS: 1,
  MAX_PROTECTORS: 5,
} as const;

export interface PricingInput {
  hourlyRate: number; // MXN por hora del escolta, tal como esta en su perfil
  duration: number; // horas
  vehicleType: 'standard' | 'armored';
  protectionType: 'armed' | 'unarmed';
  numberOfProtectors: number;
}

export interface PriceBreakdown {
  // Todo en MXN con 2 decimales exactos
  baseSubtotal: number; // tarifa × horas × escoltas, sin recargos
  armoredSurcharge: number;
  armedSurcharge: number;
  subtotal: number; // lo que cuesta el servicio
  processingFee: number;
  total: number; // lo que paga el cliente
  platformCut: number;
  guardPayout: number;
  // Lo mismo en centavos, para cobrar sin redondeos
  totalCents: number;
}

const toCents = (mxn: number) => Math.round(mxn * 100);
const toMXN = (cents: number) => Math.round(cents) / 100;

export class PricingError extends Error {}

export function validatePricingInput(input: PricingInput): void {
  const { hourlyRate, duration, numberOfProtectors, vehicleType, protectionType } = input;
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) throw new PricingError('Invalid hourly rate');
  if (!Number.isInteger(duration) || duration < PRICING.MIN_DURATION_HOURS || duration > PRICING.MAX_DURATION_HOURS) {
    throw new PricingError(`Duration must be between ${PRICING.MIN_DURATION_HOURS} and ${PRICING.MAX_DURATION_HOURS} hours`);
  }
  if (!Number.isInteger(numberOfProtectors) || numberOfProtectors < PRICING.MIN_PROTECTORS || numberOfProtectors > PRICING.MAX_PROTECTORS) {
    throw new PricingError(`Protectors must be between ${PRICING.MIN_PROTECTORS} and ${PRICING.MAX_PROTECTORS}`);
  }
  if (vehicleType !== 'standard' && vehicleType !== 'armored') throw new PricingError('Invalid vehicle type');
  if (protectionType !== 'armed' && protectionType !== 'unarmed') throw new PricingError('Invalid protection type');
}

export function calculatePrice(input: PricingInput): PriceBreakdown {
  validatePricingInput(input);
  const { hourlyRate, duration, numberOfProtectors, vehicleType, protectionType } = input;

  const baseCents = toCents(hourlyRate) * duration * numberOfProtectors;
  const vehicleMult = vehicleType === 'armored' ? PRICING.ARMORED_VEHICLE_MULTIPLIER : 1;
  const armedMult = protectionType === 'armed' ? PRICING.ARMED_PROTECTION_MULTIPLIER : 1;

  const afterVehicleCents = Math.round(baseCents * vehicleMult);
  const subtotalCents = Math.round(afterVehicleCents * armedMult);
  const armoredCents = afterVehicleCents - baseCents;
  const armedCents = subtotalCents - afterVehicleCents;

  const feeCents = Math.round(subtotalCents * PRICING.PROCESSING_FEE_PERCENT) + PRICING.PROCESSING_FEE_FIXED_CENTS;
  const totalCents = subtotalCents + feeCents;
  const platformCents = Math.round(subtotalCents * PRICING.PLATFORM_CUT_PERCENT);
  const payoutCents = subtotalCents - platformCents;

  return {
    baseSubtotal: toMXN(baseCents),
    armoredSurcharge: toMXN(armoredCents),
    armedSurcharge: toMXN(armedCents),
    subtotal: toMXN(subtotalCents),
    processingFee: toMXN(feeCents),
    total: toMXN(totalCents),
    platformCut: toMXN(platformCents),
    guardPayout: toMXN(payoutCents),
    totalCents,
  };
}

// Compara importes guardados contra el calculo canonico (tolerancia de 1 centavo).
export function amountsMatch(a: number | undefined, b: number): boolean {
  return typeof a === 'number' && Math.abs(toCents(a) - toCents(b)) <= 1;
}

