import { PUBLIC_DEMO } from '@/constants/demo';
import { paymentService } from '@/services/paymentService';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { addDoc, collection, getDocs } from 'firebase/firestore';
import { Copy, ExternalLink, Receipt, Search } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  InfoRow,
  Input,
  NavBar,
  Screen,
  SectionTitle,
  SkeletonCard,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import {
  Notice,
  RoleGate,
  Sheet,
  fetchAllBookings,
  formatDate,
  formatDateTime,
  fullName,
  isPaid,
  money,
  openDocument,
  shortId,
} from '@/components/backoffice';
import { withErrorBoundary } from '@/components/CriticalScreenErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import i18n from '@/i18n';
import { db as getDb } from '@/lib/firebase';
import { UserRecord, userService } from '@/services/userService';
import type { Booking } from '@/types';
import { confirm } from '@/utils/confirm';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

type Filter = 'open' | 'recorded' | 'all';

// Registro manual de un reembolso hecho en el panel de Stripe. La app NO
// mueve dinero: el reembolso real se hace en Stripe (o, en el futuro, en un
// endpoint del servidor) y aqui solo se deja constancia.
interface RefundRecord {
  id: string;
  bookingId: string;
  paymentId?: string;
  amount?: number;
  status?: string;
  processedBy?: string;
  createdAt?: string;
  note?: string;
}

// "cancelada por el cliente" / "por el cliente"; si llega otro valor se muestra tal cual.
const cancelledByText = (who: string | undefined, kind: 'cancelledBy' | 'by'): string | null => {
  if (!who) return null;
  return who === 'client' || who === 'guard' ? i18n.t(`backoffice:refunds.${kind}.${who}`) : who;
};

const stripeUrl = (transactionId: string) =>
  transactionId.startsWith('pi_') ? `https://dashboard.stripe.com/payments/${transactionId}` : null;

function AdminRefundsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['admin']} nav>
        <AdminRefundsScreen />
      </RoleGate>
    </>
  );
}

function AdminRefundsScreen() {
  const { t } = useTranslation(['backoffice', 'common', 'auth']);
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [refunds, setRefunds] = useState<Record<string, RefundRecord>>({});
  const [people, setPeople] = useState<Record<string, UserRecord>>({});
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [all, refundSnap] = await Promise.all([fetchAllBookings(), getDocs(collection(getDb(), 'refunds'))]);
      // Pagadas (el servidor confirmo el cobro) y luego canceladas o rechazadas.
      const candidates = all.filter((b) => (b.status === 'cancelled' || b.status === 'rejected') && isPaid(b));
      const byBooking: Record<string, RefundRecord> = {};
      refundSnap.docs.forEach((d) => {
        const r = { ...(d.data() as Omit<RefundRecord, 'id'>), id: d.id };
        if (r.bookingId) byBooking[r.bookingId] = r;
      });
      setBookings(candidates);
      setRefunds(byBooking);
      setPeople(await userService.getUsersByIds(candidates.flatMap((b) => [b.clientId, b.guardId])));
    } catch (e) {
      logger.error('[AdminRefunds] Failed to load refund candidates', e);
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (bookings ?? []).filter((b) => {
      const recorded = !!refunds[b.id];
      if (filter === 'open' && recorded) return false;
      if (filter === 'recorded' && !recorded) return false;
      if (!q) return true;
      const client = people[b.clientId];
      return [b.id, b.transactionId, client ? fullName(client) : '', client?.email].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [bookings, refunds, people, filter, search]);

  const totals = useMemo(() => {
    const open = (bookings ?? []).filter((b) => !refunds[b.id]);
    return {
      openCount: open.length,
      openAmount: open.reduce((s, b) => s + money(b.totalAmount), 0),
      recordedCount: (bookings ?? []).length - open.length,
    };
  }, [bookings, refunds]);

  const openDetail = (b: Booking) => {
    setSelected(b);
    setCopied(false);
    setRecordError(null);
  };

  const copyTransaction = async () => {
    if (!selected?.transactionId) return;
    await Clipboard.setStringAsync(selected.transactionId);
    setCopied(true);
  };

  const recordRefund = async () => {
    if (!selected || !user) return;
    const ok = await confirm(
      (PUBLIC_DEMO ? t('auth:publicDemo.refundTitle') : t('refunds.recordTitle')),
      PUBLIC_DEMO ? t('auth:publicDemo.refundHelp') : t('refunds.recordMessage', { amount: formatMXN(selected.totalAmount) }),
      PUBLIC_DEMO ? t('auth:publicDemo.refundTitle') : t('refunds.recordConfirm'),
      t('common:actions.cancel')
    );
    if (!ok) return;
    setRecording(true);
    setRecordError(null);
    try {
      if (PUBLIC_DEMO) {
        const result = await paymentService.processRefund(selected.transactionId || '', selected.id);
        if (!result.success) throw new Error(result.error);
      }
      const now = new Date().toISOString();
      const record = {
        bookingId: selected.id,
        paymentId: selected.transactionId ?? null,
        amount: money(selected.totalAmount),
        reason: selected.cancellationReason ?? selected.rejectionReason ?? null,
        status: 'completed',
        processedBy: user.id,
        source: PUBLIC_DEMO ? 'local_demo' : 'stripe_dashboard_manual',
        createdAt: now,
        completedAt: now,
      };
      const ref = await addDoc(collection(getDb(), 'refunds'), record);
      setRefunds((prev) => ({ ...prev, [selected.id]: { ...record, id: ref.id, paymentId: record.paymentId ?? undefined } }));
      setSelected(null);
    } catch (e) {
      logger.error('[AdminRefunds] Failed to record refund', e);
      setRecordError(t('refunds.recordError'));
    } finally {
      setRecording(false);
    }
  };

  const selectedClient = selected ? people[selected.clientId] : undefined;
  const selectedGuard = selected?.guardId ? people[selected.guardId] : undefined;
  const selectedRefund = selected ? refunds[selected.id] : undefined;
  const selectedStripe = selected?.transactionId ? stripeUrl(selected.transactionId) : null;

  return (
    <View style={styles.root}>
      <NavBar title={t('refunds.title')} />
      <Screen
        padTop={false}
        keyboard
        contentStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        <View style={styles.header}>
          <AppText variant="title2">{t('refunds.title')}</AppText>
          <AppText variant="callout">{PUBLIC_DEMO ? t('auth:publicDemo.refundHelp') : t('refunds.description')}</AppText>
        </View>

        {error ? (
          <Notice tone="error" message={t('refunds.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} />
        ) : bookings === null ? (
          <>
            <View style={styles.grid}>
              <SkeletonCard lines={1} />
              <SkeletonCard lines={1} />
            </View>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <View style={styles.grid}>
              <StatTile
                label={t('refunds.toReview')}
                value={totals.openCount}
                hint={formatMXN(totals.openAmount)}
                icon={Receipt}
                accent={totals.openCount > 0}
              />
              <StatTile label={t('refunds.recorded')} value={totals.recordedCount} hint={PUBLIC_DEMO ? t('auth:publicDemo.simulatedRefunds') : t('refunds.recordedHint')} />
            </View>

            <Input
              icon={Search}
              placeholder={t('refunds.search')}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('refunds.searchA11y')}
              containerStyle={styles.search}
            />
            <View style={styles.chips}>
              <Chip label={t('refunds.toReview')} selected={filter === 'open'} onPress={() => setFilter('open')} count={totals.openCount} />
              <Chip label={t('refunds.recorded')} selected={filter === 'recorded'} onPress={() => setFilter('recorded')} count={totals.recordedCount} />
              <Chip label={t('refunds.all')} selected={filter === 'all'} onPress={() => setFilter('all')} count={bookings.length} />
            </View>

            <SectionTitle
              title={filter === 'open' ? t('refunds.toReview') : filter === 'recorded' ? t('refunds.sectionRecorded') : t('refunds.sectionAll')}
            />
            {list.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={bookings.length === 0 ? t('refunds.emptyTitle') : t('shared.noMatches')}
                message={bookings.length === 0 ? t('refunds.emptyMessage') : t('refunds.noMatchesMessage')}
              />
            ) : (
              <View style={styles.list}>
                {list.map((b) => {
                  const client = people[b.clientId];
                  const recorded = !!refunds[b.id];
                  return (
                    <Card
                      key={b.id}
                      onPress={() => openDetail(b)}
                      accessibilityLabel={t('refunds.cardA11y', { id: shortId(b.id) })}
                      style={styles.card}
                    >
                      <View style={styles.row}>
                        <AppText variant="headline" style={styles.flex} numberOfLines={1}>
                          {client ? fullName(client) : t('refunds.client')}
                        </AppText>
                        <AppText variant="numeric" color={Colors.accentLight}>
                          {formatMXN(b.totalAmount)}
                        </AppText>
                      </View>
                      <View style={styles.badges}>
                        <StatusBadge status={b.status} />
                        {recorded ? (
                          <Badge label={t('refunds.refundRecorded')} tone="success" />
                        ) : (
                          <Badge label={(PUBLIC_DEMO ? t('refunds.toReview') : t('refunds.reviewInStripe'))} tone="warning" />
                        )}
                      </View>
                      <AppText variant="caption" color={Colors.textTertiary}>
                        {[shortId(b.id), formatDate(b.cancelledAt ?? b.rejectedAt ?? b.createdAt), cancelledByText(b.cancelledBy, 'cancelledBy')]
                          .filter(Boolean)
                          .join(' · ')}
                      </AppText>
                    </Card>
                  );
                })}
              </View>
            )}
          </>
        )}
      </Screen>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        dismissable={!recording}
        eyebrow={selected ? t('refunds.booking', { id: shortId(selected.id) }) : undefined}
        title={selected ? formatMXN(selected.totalAmount) : ''}
        subtitle={selectedRefund ? t('refunds.recordedOn', { date: formatDateTime(selectedRefund.createdAt) }) : t('refunds.paidByClient')}
        footer={
          selected && !selectedRefund ? (
            <Button
              title={(PUBLIC_DEMO ? t('auth:publicDemo.refundTitle') : t('refunds.recordTitle'))}
              onPress={recordRefund}
              loading={recording}
              accessibilityLabel={PUBLIC_DEMO ? t('auth:publicDemo.refundTitle') : t('refunds.recordA11y')}
              style={styles.flex}
            />
          ) : (
            <Button title={t('common:actions.close')} variant="secondary" onPress={() => setSelected(null)} style={styles.flex} />
          )
        }
      >
        {selected ? (
          <>
            <View>
              <InfoRow label={t('refunds.status')} value={<StatusBadge status={selected.status} />} />
              <InfoRow label={t('refunds.client')} value={selectedClient ? fullName(selectedClient) : '—'} />
              <InfoRow label={t('refunds.guard')} value={selectedGuard ? fullName(selectedGuard) : '—'} />
              <InfoRow label={t('refunds.scheduled')} value={formatDate(selected.scheduledDate)} />
              {selected.status === 'cancelled' ? (
                <InfoRow
                  label={t('refunds.cancelled')}
                  value={[formatDateTime(selected.cancelledAt), cancelledByText(selected.cancelledBy, 'by')].filter(Boolean).join(' · ')}
                />
              ) : (
                <InfoRow label={t('refunds.declined')} value={formatDateTime(selected.rejectedAt)} />
              )}
              <InfoRow label={t('refunds.guardPayout')} value={formatMXN(selected.guardPayout)} />
              <InfoRow label={t('refunds.platformFee')} value={formatMXN(selected.platformCut)} />
              <InfoRow label={t('refunds.cardProcessing')} value={formatMXN(selected.processingFee)} />
              <InfoRow label={t('refunds.totalPaid')} value={formatMXN(selected.totalAmount)} emphasis />
            </View>

            {selected.cancellationReason || selected.rejectionReason ? (
              <Notice tone="info" title={t('refunds.reasonGiven')} message={selected.cancellationReason ?? selected.rejectionReason ?? ''} />
            ) : null}

            <Card tone="raised" style={styles.txCard}>
              <AppText variant="overline">{PUBLIC_DEMO ? t('auth:publicDemo.transaction') : t('refunds.stripeTransaction')}</AppText>
              <AppText variant="numeric" selectable numberOfLines={2}>
                {selected.transactionId}
              </AppText>
              <View style={styles.row}>
                <Button
                  title={copied ? t('common:actions.copied') : t('refunds.copyId')}
                  icon={Copy}
                  variant="secondary"
                  size="sm"
                  onPress={copyTransaction}
                  style={styles.flex}
                  accessibilityLabel={PUBLIC_DEMO ? t('refunds.copyId') : t('refunds.copyA11y')}
                />
                {selectedStripe ? (
                  <Button
                    title={t('refunds.openStripe')}
                    icon={ExternalLink}
                    variant="outline"
                    size="sm"
                    onPress={() => openDocument(selectedStripe)}
                    style={styles.flex}
                    accessibilityLabel={t('refunds.openStripeA11y')}
                  />
                ) : null}
              </View>
            </Card>

            {!selectedRefund ? (
              <Notice
                tone="warning"
                message={
                  PUBLIC_DEMO ? t('auth:publicDemo.refundHelp') : selected.status === 'rejected' ? t('refunds.declinedWarning') : t('refunds.refundWarning')
                }
              />
            ) : null}
            {recordError ? <Notice tone="error" message={recordError} /> : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingTop: Space.xl,
  },
  header: {
    gap: Space.sm,
    marginBottom: Space.xl,
  },
  grid: {
    flexDirection: 'row',
    gap: Space.md,
  },
  search: {
    marginTop: Space.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.md,
  },
  list: {
    gap: Space.md,
  },
  card: {
    gap: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  // Dos insignias que en espanol pueden no caber en una linea a 375 px.
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  txCard: {
    gap: Space.sm,
  },
  flex: {
    flex: 1,
  },
});

// Getter: el mensaje se lee al dibujar el fallback, en el idioma activo.
export default withErrorBoundary(AdminRefundsRoute, {
  get fallbackMessage() {
    return i18n.t('backoffice:refunds.crash');
  },
});
