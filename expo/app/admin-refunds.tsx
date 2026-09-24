import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
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
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [refunds, setRefunds] = useState<Record<string, RefundRecord>>({});
  const [people, setPeople] = useState<Record<string, UserRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
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
      setError('Refund data could not be loaded.');
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
      'Record refund',
      `Only do this after refunding ${formatMXN(selected.totalAmount)} in the Stripe dashboard. This records it here; it does not move money.`,
      'Record refund',
      'Cancel'
    );
    if (!ok) return;
    setRecording(true);
    setRecordError(null);
    try {
      const now = new Date().toISOString();
      const record = {
        bookingId: selected.id,
        paymentId: selected.transactionId ?? null,
        amount: money(selected.totalAmount),
        reason: selected.cancellationReason ?? selected.rejectionReason ?? null,
        status: 'completed',
        processedBy: user.id,
        source: 'stripe_dashboard_manual',
        createdAt: now,
        completedAt: now,
      };
      const ref = await addDoc(collection(getDb(), 'refunds'), record);
      setRefunds((prev) => ({ ...prev, [selected.id]: { ...record, id: ref.id, paymentId: record.paymentId ?? undefined } }));
      setSelected(null);
    } catch (e) {
      logger.error('[AdminRefunds] Failed to record refund', e);
      setRecordError('The refund could not be recorded. Please try again.');
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
      <NavBar title="Refunds" />
      <Screen
        padTop={false}
        keyboard
        contentStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        <View style={styles.header}>
          <AppText variant="title2">Refunds</AppText>
          <AppText variant="callout">
            Paid bookings that were cancelled, or declined by the guard. Refunds are issued in the Stripe dashboard — this
            app never moves money. Declined bookings may still be reassigned by the client.
          </AppText>
        </View>

        {error ? (
          <Notice tone="error" message={error} actionLabel="Try again" onAction={load} />
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
              <StatTile label="To review" value={totals.openCount} hint={formatMXN(totals.openAmount)} icon={Receipt} accent={totals.openCount > 0} />
              <StatTile label="Recorded" value={totals.recordedCount} hint="Refunded in Stripe" />
            </View>

            <Input
              icon={Search}
              placeholder="Booking, transaction or client"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search refunds"
              containerStyle={styles.search}
            />
            <View style={styles.chips}>
              <Chip label="To review" selected={filter === 'open'} onPress={() => setFilter('open')} count={totals.openCount} />
              <Chip label="Recorded" selected={filter === 'recorded'} onPress={() => setFilter('recorded')} count={totals.recordedCount} />
              <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} count={bookings.length} />
            </View>

            <SectionTitle title={filter === 'open' ? 'To review' : filter === 'recorded' ? 'Recorded refunds' : 'All paid cancellations'} />
            {list.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={bookings.length === 0 ? 'Nothing to refund' : 'No matches'}
                message={bookings.length === 0 ? 'Paid bookings that get cancelled or declined will appear here.' : 'Try another search or filter.'}
              />
            ) : (
              <View style={styles.list}>
                {list.map((b) => {
                  const client = people[b.clientId];
                  const recorded = !!refunds[b.id];
                  return (
                    <Card key={b.id} onPress={() => openDetail(b)} accessibilityLabel={`Refund details for booking ${shortId(b.id)}`} style={styles.card}>
                      <View style={styles.row}>
                        <AppText variant="headline" style={styles.flex} numberOfLines={1}>
                          {client ? fullName(client) : 'Client'}
                        </AppText>
                        <AppText variant="numeric" color={Colors.goldLight}>
                          {formatMXN(b.totalAmount)}
                        </AppText>
                      </View>
                      <View style={styles.row}>
                        <StatusBadge status={b.status} />
                        {recorded ? <Badge label="Refund recorded" tone="success" /> : <Badge label="Review in Stripe" tone="warning" />}
                      </View>
                      <AppText variant="caption" color={Colors.textTertiary} numberOfLines={1}>
                        {shortId(b.id)} · {formatDate(b.cancelledAt ?? b.rejectedAt ?? b.createdAt)}
                        {b.cancelledBy ? ` · cancelled by ${b.cancelledBy}` : ''}
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
        eyebrow={selected ? `Booking ${shortId(selected.id)}` : undefined}
        title={selected ? formatMXN(selected.totalAmount) : ''}
        subtitle={selectedRefund ? `Refund recorded ${formatDateTime(selectedRefund.createdAt)}` : 'Paid by the client'}
        footer={
          selected && !selectedRefund ? (
            <Button title="Record refund" onPress={recordRefund} loading={recording} accessibilityLabel="Record a refund made in Stripe" />
          ) : (
            <Button title="Close" variant="secondary" onPress={() => setSelected(null)} />
          )
        }
      >
        {selected ? (
          <>
            <View>
              <InfoRow label="Status" value={<StatusBadge status={selected.status} />} />
              <InfoRow label="Client" value={selectedClient ? fullName(selectedClient) : '—'} />
              <InfoRow label="Guard" value={selectedGuard ? fullName(selectedGuard) : '—'} />
              <InfoRow label="Scheduled" value={formatDate(selected.scheduledDate)} />
              {selected.status === 'cancelled' ? (
                <InfoRow label="Cancelled" value={`${formatDateTime(selected.cancelledAt)}${selected.cancelledBy ? ` · by ${selected.cancelledBy}` : ''}`} />
              ) : (
                <InfoRow label="Declined" value={formatDateTime(selected.rejectedAt)} />
              )}
              <InfoRow label="Guard payout" value={formatMXN(selected.guardPayout)} />
              <InfoRow label="Platform fee" value={formatMXN(selected.platformCut)} />
              <InfoRow label="Card processing" value={formatMXN(selected.processingFee)} />
              <InfoRow label="Total paid" value={formatMXN(selected.totalAmount)} emphasis />
            </View>

            {selected.cancellationReason || selected.rejectionReason ? (
              <Notice tone="info" title="Reason given" message={selected.cancellationReason ?? selected.rejectionReason ?? ''} />
            ) : null}

            <Card tone="raised" style={styles.txCard}>
              <AppText variant="overline">Stripe transaction</AppText>
              <AppText variant="numeric" selectable numberOfLines={2}>
                {selected.transactionId}
              </AppText>
              <View style={styles.row}>
                <Button
                  title={copied ? 'Copied' : 'Copy ID'}
                  icon={Copy}
                  variant="secondary"
                  size="sm"
                  onPress={copyTransaction}
                  style={styles.flex}
                  accessibilityLabel="Copy the Stripe transaction ID"
                />
                {selectedStripe ? (
                  <Button
                    title="Open in Stripe"
                    icon={ExternalLink}
                    variant="outline"
                    size="sm"
                    onPress={() => openDocument(selectedStripe)}
                    style={styles.flex}
                    accessibilityLabel="Open this payment in the Stripe dashboard"
                  />
                ) : null}
              </View>
            </Card>

            {!selectedRefund ? (
              <Notice
                tone="warning"
                message={
                  selected.status === 'rejected'
                    ? 'The guard declined this booking. The client can still pick a new guard with the same payment — check with them before refunding.'
                    : 'Refund this payment in the Stripe dashboard, then record it here so the team knows it was handled.'
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
  txCard: {
    gap: Space.sm,
  },
  flex: {
    flex: 1,
  },
});

export default withErrorBoundary(AdminRefundsRoute, {
  fallbackMessage: 'Refunds could not be displayed. Please try again.',
});
