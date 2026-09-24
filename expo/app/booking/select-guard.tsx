import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, FileQuestion, Lock, Send, ShieldCheck, UserX } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, MAX_CONTENT_WIDTH, Radius, Shadow, Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Button,
  Card,
  EmptyState,
  InfoRow,
  NavBar,
  Screen,
  SectionTitle,
  SkeletonCard,
  StatusBadge,
} from '@/components/ui';
import { GuardCard } from '@/components/funnel/GuardCard';
import { distanceKm, formatScheduled, guardDisplayName, isVerified } from '@/components/funnel/format';
import { bookingService } from '@/services/bookingService';
import { guardService, hasCompleteProfile, hasCoordinates } from '@/services/guardService';
import type { Booking, Guard } from '@/types';
import { formatMXN } from '@/utils/pricing';

type LoadState = 'loading' | 'ready' | 'error' | 'missing-param' | 'not-found';

export default function SelectGuardScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [candidate, setCandidate] = useState<Guard | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Guard | null>(null);

  const load = useCallback(async () => {
    if (!bookingId) {
      setState('missing-param');
      return;
    }
    setState('loading');
    try {
      const found = await bookingService.getBookingById(bookingId);
      if (!found) {
        setState('not-found');
        return;
      }
      setBooking(found);
      const all = await guardService.listAvailableGuards();
      // Never offer the protector who just declined this booking.
      setGuards(all.filter((g) => g.id !== found.guardId && hasCompleteProfile(g)));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  // Closest to the pickup first when both points are real; otherwise by track record.
  const pickup = useMemo(() => {
    if (!booking) return null;
    const point = { latitude: booking.pickupLatitude, longitude: booking.pickupLongitude };
    return hasCoordinates(point) ? point : null;
  }, [booking]);
  const ranked = useMemo(() => {
    const withDistance = guards.map((g) => ({
      guard: g,
      km: pickup && hasCoordinates(g) ? distanceKm(pickup, g) : undefined,
    }));
    return withDistance.sort(
      (a, b) =>
        (a.km ?? Number.POSITIVE_INFINITY) - (b.km ?? Number.POSITIVE_INFINITY) ||
        b.guard.rating - a.guard.rating ||
        b.guard.completedJobs - a.guard.completedJobs
    );
  }, [guards, pickup]);

  const confirmSend = async () => {
    if (!booking || !candidate || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await bookingService.reassignGuard(booking.id, candidate.id);
      setSentTo(candidate);
      setCandidate(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'We could not send the request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const shell = (content: React.ReactNode, opts?: { list?: boolean }) => (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <NavBar title="Choose a protector" right={booking ? <StatusBadge status={booking.status} /> : undefined} />
      {opts?.list ? content : <Screen padTop={false} contentStyle={styles.content}>{content}</Screen>}
    </View>
  );

  if (state === 'missing-param') {
    return shell(
      <EmptyState
        icon={FileQuestion}
        title="No booking selected"
        message="Open this screen from one of your bookings."
        actionLabel="Go to bookings"
        onAction={() => router.replace('/bookings')}
      />
    );
  }

  if (state === 'not-found') {
    return shell(
      <EmptyState
        icon={FileQuestion}
        title="Booking not found"
        message="It may have been cancelled or you may not have access to it."
        actionLabel="Go to bookings"
        onAction={() => router.replace('/bookings')}
      />
    );
  }

  if (state === 'error') {
    return shell(
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load protectors"
        message="Check your connection and try again."
        actionLabel="Try again"
        onAction={load}
      />
    );
  }

  if (state === 'loading' || !booking) {
    return shell(
      <View>
        <SkeletonCard lines={3} />
        <SkeletonCard media />
        <SkeletonCard media />
      </View>
    );
  }

  if (sentTo) {
    return shell(
      <EmptyState
        icon={CheckCircle2}
        title={`Request sent to ${guardDisplayName(sentTo)}`}
        message="Your booking and payment stay exactly the same. We'll notify you as soon as they respond."
        actionLabel="View booking"
        onAction={() => router.replace(`/booking/${booking.id}`)}
      />
    );
  }

  // Reassignment is only for a paid booking that the previous protector declined.
  if (booking.status !== 'rejected') {
    return shell(
      <EmptyState
        icon={ShieldCheck}
        title="No new protector needed"
        message="This booking isn't waiting for a replacement protector."
        actionLabel="View booking"
        onAction={() => router.replace(`/booking/${booking.id}`)}
      />
    );
  }

  const header = (
    <View>
      <AppText variant="title1" accessibilityRole="header">
        Choose another protector
      </AppText>
      <AppText variant="callout" style={styles.lede}>
        Your previous protector couldn’t take this booking. Pick someone else and we’ll send them the request.
      </AppText>

      {booking.rejectionReason ? (
        <Card style={styles.reason}>
          <AppText variant="overline">Their note</AppText>
          <AppText variant="body" color={Colors.textSecondary} style={styles.reasonText}>
            “{booking.rejectionReason}”
          </AppText>
        </Card>
      ) : null}

      <Card tone="raised" style={styles.summary}>
        <InfoRow label="When" value={formatScheduled(booking)} />
        <InfoRow label="Pickup" value={booking.pickupAddress || '—'} />
        <InfoRow label="Paid" value={formatMXN(booking.totalAmount)} emphasis />
        <View style={styles.fixedNote}>
          <Lock size={14} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
          <AppText variant="footnote" color={Colors.textTertiary} style={styles.flex}>
            The amount you paid stays the same whoever you choose — amounts are fixed once a booking is paid.
          </AppText>
        </View>
      </Card>

      <SectionTitle title={`${ranked.length} available ${ranked.length === 1 ? 'protector' : 'protectors'}`} />
    </View>
  );

  return shell(
    <>
      <Screen scroll={false} padTop={false}>
        <FlatList
          data={ranked}
          keyExtractor={(r) => r.guard.id}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon={UserX}
              title="No other protectors available"
              message="Try again a little later, or manage the booking from its detail page."
              actionLabel="Refresh"
              onAction={load}
            />
          }
          renderItem={({ item }) => (
            <GuardCard
              guard={item.guard}
              distanceKm={item.km}
              showRate={false}
              onPress={() => {
                setSendError(null);
                setCandidate(item.guard);
              }}
              accessibilityHint="Sends this protector your booking request"
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </Screen>
      <ConfirmSheet
        guard={candidate}
        sending={sending}
        error={sendError}
        onConfirm={confirmSend}
        onClose={() => (sending ? undefined : setCandidate(null))}
      />
    </>,
    { list: true }
  );
}

// Choice dialog as a sheet (Alert.alert only runs the first button on web).
function ConfirmSheet({
  guard,
  sending,
  error,
  onConfirm,
  onClose,
}: {
  guard: Guard | null;
  sending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!guard} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" />
        {guard ? (
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Space.xl) }]} accessibilityViewIsModal>
            <View style={styles.sheetHead}>
              <Avatar name={`${guard.firstName} ${guard.lastName}`} uri={guard.photos[0]} size={56} verified={isVerified(guard)} />
              <View style={styles.flex}>
                <AppText variant="overline">Send request to</AppText>
                <AppText variant="title2">{guardDisplayName(guard)}</AppText>
              </View>
            </View>
            <AppText variant="callout" style={styles.sheetBody}>
              They’ll be asked to accept your booking. Your schedule, options and the amount you paid don’t change.
            </AppText>
            {error ? (
              <AppText variant="callout" color={Colors.error} style={styles.sheetError} accessibilityLiveRegion="polite">
                {error}
              </AppText>
            ) : null}
            <Button title="Send request" icon={Send} size="lg" onPress={onConfirm} loading={sending} />
            <Button title="Cancel" variant="ghost" onPress={onClose} disabled={sending} style={styles.cancel} />
          </View>
        ) : null}
      </View>
    </Modal>
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
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xl,
    paddingBottom: Space.huge,
    flexGrow: 1,
  },
  lede: {
    marginTop: Space.sm,
  },
  reason: {
    marginTop: Space.xl,
  },
  reasonText: {
    marginTop: Space.xs,
  },
  summary: {
    marginTop: Space.lg,
  },
  fixedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    marginTop: Space.sm,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  sheet: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH + Space.gutter * 2,
    alignSelf: 'center',
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xxl,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.borderStrong,
    ...Shadow.lg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  sheetBody: {
    marginTop: Space.lg,
    marginBottom: Space.xl,
  },
  sheetError: {
    marginBottom: Space.lg,
  },
  cancel: {
    marginTop: Space.sm,
  },
});
