import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Divider, InfoRow } from '@/components/ui';
import { Space } from '@/constants/design';
import { formatMXN, PRICING } from '@/utils/pricing';
import type { ServerBreakdown } from '@/services/paymentService';

const pct = (multiplier: number) => `+${Math.round((multiplier - 1) * 100)}%`;

export interface PriceReceiptProps {
  // From calculatePrice (live quote) or from the server (canonical amounts).
  breakdown: ServerBreakdown;
  duration?: number;
  protectors?: number;
}

// Receipt lines. Only prints what it was given: no line is recomputed here.
export function PriceReceipt({ breakdown, duration, protectors }: PriceReceiptProps) {
  const { t } = useTranslation('funnel');
  const base = breakdown.baseSubtotal ?? breakdown.subtotal;
  const serviceLabel =
    duration && protectors
      ? protectors > 1
        ? t('receipt.serviceTeam', { hours: duration, protectors })
        : t('receipt.service', { hours: duration })
      : t('receipt.serviceGeneric');

  return (
    <View style={styles.receipt}>
      {typeof base === 'number' ? <InfoRow label={serviceLabel} value={formatMXN(base)} /> : null}
      {breakdown.armoredSurcharge ? (
        <InfoRow
          label={t('receipt.armored', { pct: pct(PRICING.ARMORED_VEHICLE_MULTIPLIER) })}
          value={formatMXN(breakdown.armoredSurcharge)}
        />
      ) : null}
      {breakdown.armedSurcharge ? (
        <InfoRow
          label={t('receipt.armed', { pct: pct(PRICING.ARMED_PROTECTION_MULTIPLIER) })}
          value={formatMXN(breakdown.armedSurcharge)}
        />
      ) : null}
      {typeof breakdown.processingFee === 'number' ? (
        <InfoRow label={t('receipt.processingFee')} value={formatMXN(breakdown.processingFee)} />
      ) : null}
      <Divider style={styles.divider} />
      <InfoRow label={t('receipt.total')} value={formatMXN(breakdown.total)} emphasis />
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: {
    alignSelf: 'stretch',
  },
  divider: {
    marginVertical: Space.sm,
  },
});
