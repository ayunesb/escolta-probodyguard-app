import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Camera, FileText, History, IdCard, ShieldCheck, ShieldX } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  ListGroup,
  ListRow,
  Screen,
  ScreenHeader,
  SectionTitle,
  SegmentedControl,
  SkeletonCard,
} from '@/components/ui';
import { Notice, RoleGate, Sheet, formatDate, fullName, kycMeta, openDocument, plural } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { kycAuditService } from '@/services/kycAuditService';
import { countKycDocuments, GuardKycRecord, UserRecord, userService } from '@/services/userService';
import type { KYCStatus } from '@/types';
import { confirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

type Tab = KYCStatus;

interface DocItem {
  key: string;
  label: string;
  url: string;
  kind: 'private' | 'public';
}

const DOC_LABELS: { field: keyof GuardKycRecord; label: string }[] = [
  { field: 'governmentIdUrls', label: 'Government ID' },
  { field: 'licenseUrls', label: 'Security license' },
  { field: 'insuranceUrls', label: 'Insurance' },
  { field: 'vehicleDocUrls', label: 'Vehicle document' },
];

function documentItems(guard: UserRecord, kyc: GuardKycRecord | null): DocItem[] {
  const items: DocItem[] = [];
  DOC_LABELS.forEach(({ field, label }) => {
    const urls = (kyc?.[field] as string[] | undefined) ?? [];
    urls.forEach((url, i) =>
      items.push({ key: `${field}-${i}`, label: urls.length > 1 ? `${label} · ${i + 1} of ${urls.length}` : label, url, kind: 'private' })
    );
  });
  (guard.photos ?? []).forEach((url, i) => items.push({ key: `photo-${i}`, label: 'Profile photo', url, kind: 'public' }));
  const outfits = guard.outfitPhotos ?? [];
  outfits.forEach((url, i) =>
    items.push({ key: `outfit-${i}`, label: outfits.length > 1 ? `Outfit photo · ${i + 1} of ${outfits.length}` : 'Outfit photo', url, kind: 'public' })
  );
  return items;
}

export default function AdminKYCRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['admin']}>
        <AdminKYCScreen />
      </RoleGate>
    </>
  );
}

function AdminKYCScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [guards, setGuards] = useState<UserRecord[] | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Revision abierta
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [selectedKyc, setSelectedKyc] = useState<GuardKycRecord | null>(null);
  const [kycState, setKycState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mode, setMode] = useState<'review' | 'reject'>('review');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await userService.listByRole('guard');
      list.sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0));
      setGuards(list);
      // Cuantos documentos tiene cada escolta en revision (lectura puntual
      // del documento privado, solo para la cola pendiente).
      const pending = list.filter((g) => (g.kycStatus ?? 'pending') === 'pending');
      const results = await Promise.allSettled(pending.map((g) => userService.getGuardKyc(g.id)));
      const counts: Record<string, number> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') counts[pending[i].id] = countKycDocuments(r.value);
      });
      setDocCounts(counts);
    } catch (error) {
      logger.error('[AdminKYC] Failed to load guards', error);
      setLoadError('We could not load verification requests.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const grouped = useMemo(() => {
    const g: Record<Tab, UserRecord[]> = { pending: [], approved: [], rejected: [] };
    (guards ?? []).forEach((guard) => {
      const s = (guard.kycStatus ?? 'pending') as Tab;
      (g[s] ?? g.pending).push(guard);
    });
    return g;
  }, [guards]);

  const openReview = async (guard: UserRecord) => {
    setSelected(guard);
    setSelectedKyc(null);
    setMode('review');
    setReason('');
    setReasonError(null);
    setActionError(null);
    setOpenError(null);
    setKycState('loading');
    try {
      setSelectedKyc(await userService.getGuardKyc(guard.id));
      setKycState('ready');
    } catch (error) {
      logger.error('[AdminKYC] Failed to load guard KYC record', error);
      setKycState('error');
    }
  };

  const closeReview = () => {
    if (acting) return;
    setSelected(null);
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!selected || !user) return;
    const name = fullName(selected);
    if (decision === 'rejected') {
      const trimmed = reason.trim();
      if (trimmed.length < 5) {
        setReasonError('Tell the guard what to fix (at least 5 characters).');
        return;
      }
    } else {
      const ok = await confirm('Approve verification', `${name} will be able to accept bookings.`, 'Approve', 'Cancel');
      if (!ok) return;
    }
    setActing(decision === 'approved' ? 'approve' : 'reject');
    setActionError(null);
    try {
      await userService.reviewGuardKyc({
        guardId: selected.id,
        decision,
        reviewerId: user.id,
        reason: decision === 'rejected' ? reason.trim() : undefined,
      });
      await kycAuditService.logDocumentReview(
        selected.id,
        `${selected.id}-kyc`,
        user.id,
        user.role,
        decision === 'approved' ? 'approve' : 'reject',
        selected.kycStatus ?? 'pending',
        decision,
        decision === 'rejected' ? reason.trim() : undefined
      );
      setSelected(null);
      setNotice(decision === 'approved' ? `${name} is now verified.` : `${name}'s verification was rejected. They can see your note.`);
      await load();
    } catch (error) {
      logger.error('[AdminKYC] Failed to record KYC decision', error);
      setActionError('The decision could not be saved. Nothing changed — please try again.');
    } finally {
      setActing(null);
    }
  };

  const open = async (item: DocItem) => {
    setOpenError(null);
    const ok = await openDocument(item.url);
    if (!ok) setOpenError(`Could not open ${item.label.toLowerCase()}.`);
  };

  const list = grouped[tab];
  const docs = selected ? documentItems(selected, selectedKyc) : [];
  const privateDocs = docs.filter((d) => d.kind === 'private');
  const publicDocs = docs.filter((d) => d.kind === 'public');
  const selectedStatus = (selected?.kycStatus ?? 'pending') as Tab;

  return (
    <Screen glow refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>
      <ScreenHeader
        eyebrow="Admin · Verification"
        title="Guard verification"
        subtitle="Review identity and license documents before a guard can accept bookings."
        right={<IconButton icon={History} onPress={() => router.push('/admin/kyc-audit')} accessibilityLabel="Open KYC audit trail" />}
      />

      <SegmentedControl<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: `Pending ${guards ? grouped.pending.length : ''}`.trim(), accessibilityLabel: 'Pending reviews' },
          { value: 'approved', label: `Verified ${guards ? grouped.approved.length : ''}`.trim(), accessibilityLabel: 'Verified guards' },
          { value: 'rejected', label: `Rejected ${guards ? grouped.rejected.length : ''}`.trim(), accessibilityLabel: 'Rejected guards' },
        ]}
      />

      {notice ? <Notice tone="success" message={notice} onDismiss={() => setNotice(null)} style={styles.notice} /> : null}

      <SectionTitle title={tab === 'pending' ? 'Waiting for review' : tab === 'approved' ? 'Verified guards' : 'Rejected'} />

      {loadError ? (
        <Notice tone="error" message={loadError} actionLabel="Try again" onAction={load} />
      ) : guards === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : list.length === 0 ? (
        <EmptyState
          icon={tab === 'rejected' ? ShieldX : ShieldCheck}
          title={tab === 'pending' ? 'Nothing to review' : tab === 'approved' ? 'No verified guards yet' : 'No rejected guards'}
          message={tab === 'pending' ? 'New guard applications will appear here.' : undefined}
        />
      ) : (
        <View style={styles.list}>
          {list.map((guard) => {
            const name = fullName(guard);
            const count = docCounts[guard.id];
            return (
              <Card key={guard.id} onPress={() => openReview(guard)} accessibilityLabel={`Review ${name}`} style={styles.row}>
                <Avatar name={name} uri={guard.photos?.[0]} size={48} verified={guard.kycStatus === 'approved'} />
                <View style={styles.rowText}>
                  <AppText variant="headline" numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText variant="footnote" numberOfLines={1}>
                    {guard.email}
                  </AppText>
                  <AppText variant="caption" color={Colors.textTertiary}>
                    {guard.companyId ? 'Company guard' : 'Independent'} · Updated {formatDate(guard.updatedAt)}
                  </AppText>
                </View>
                {tab === 'pending' ? (
                  typeof count === 'number' ? (
                    <Badge label={count > 0 ? plural(count, 'file') : 'No files'} tone={count > 0 ? 'gold' : 'neutral'} />
                  ) : null
                ) : (
                  <Badge {...kycMeta(guard.kycStatus)} />
                )}
              </Card>
            );
          })}
        </View>
      )}

      <Sheet
        visible={!!selected}
        onClose={closeReview}
        dismissable={!acting}
        eyebrow={mode === 'reject' ? 'Reject verification' : 'Review'}
        title={selected ? fullName(selected) : ''}
        subtitle={selected ? [selected.email, selected.phone].filter(Boolean).join(' · ') : undefined}
        footer={
          !selected ? null : mode === 'reject' ? (
            <>
              <Button title="Back" variant="secondary" onPress={() => setMode('review')} disabled={!!acting} style={styles.flex} />
              <Button
                title="Reject"
                variant="danger"
                icon={ShieldX}
                loading={acting === 'reject'}
                onPress={() => decide('rejected')}
                style={styles.flex}
                accessibilityLabel="Reject verification with this reason"
              />
            </>
          ) : (
            <>
              {selectedStatus !== 'rejected' ? (
                <Button
                  title="Reject"
                  variant="danger"
                  icon={ShieldX}
                  onPress={() => setMode('reject')}
                  disabled={!!acting}
                  style={styles.flex}
                  accessibilityLabel="Reject verification"
                />
              ) : null}
              {selectedStatus !== 'approved' ? (
                <Button
                  title="Approve"
                  icon={ShieldCheck}
                  loading={acting === 'approve'}
                  disabled={kycState !== 'ready' || privateDocs.length === 0}
                  onPress={() => decide('approved')}
                  style={styles.flex}
                  accessibilityLabel="Approve verification"
                />
              ) : null}
            </>
          )
        }
      >
        {selected ? (
          mode === 'reject' ? (
            <>
              <AppText variant="callout">
                The guard, and their company if they have one, will see this note on their documents screen.
              </AppText>
              <Input
                label="Reason"
                placeholder="e.g. License photo is blurry — please upload a sharper image."
                value={reason}
                onChangeText={(t) => {
                  setReason(t);
                  if (reasonError) setReasonError(null);
                }}
                error={reasonError}
                multiline
                maxLength={500}
                autoFocus
                accessibilityLabel="Rejection reason"
              />
              {actionError ? <Notice tone="error" message={actionError} /> : null}
            </>
          ) : (
            <>
              <View style={styles.sheetHeader}>
                <Avatar name={fullName(selected)} uri={selected.photos?.[0]} size={56} verified={selected.kycStatus === 'approved'} />
                <View style={styles.rowText}>
                  <Badge {...kycMeta(selected.kycStatus)} />
                  <AppText variant="caption" color={Colors.textTertiary}>
                    {selected.companyId ? 'Company guard' : 'Independent guard'} · Joined {formatDate(selected.createdAt)}
                  </AppText>
                </View>
              </View>

              {selectedKyc?.rejectionReason && selectedStatus === 'rejected' ? (
                <Notice tone="warning" title="Previous rejection" message={selectedKyc.rejectionReason} />
              ) : null}

              <View>
                <SectionTitle title="Verification documents" style={styles.sheetSection} />
                {kycState === 'loading' ? (
                  <SkeletonCard lines={2} />
                ) : kycState === 'error' ? (
                  <Notice tone="error" message="Could not load this guard's private documents." actionLabel="Try again" onAction={() => openReview(selected)} />
                ) : privateDocs.length === 0 ? (
                  <Notice tone="info" message="No identity or license documents uploaded yet. Approval is disabled until there is something to review." />
                ) : (
                  <ListGroup>
                    {privateDocs.map((d) => (
                      <ListRow
                        key={d.key}
                        icon={d.key.startsWith('governmentId') ? IdCard : FileText}
                        title={d.label}
                        subtitle="Opens the uploaded file"
                        onPress={() => open(d)}
                        accessibilityHint="Opens the document in a browser"
                      />
                    ))}
                  </ListGroup>
                )}
              </View>

              {publicDocs.length > 0 ? (
                <View>
                  <SectionTitle title="Photos shown to clients" style={styles.sheetSection} />
                  <ListGroup>
                    {publicDocs.map((d) => (
                      <ListRow key={d.key} icon={Camera} title={d.label} onPress={() => open(d)} accessibilityHint="Opens the photo in a browser" />
                    ))}
                  </ListGroup>
                </View>
              ) : null}

              {openError ? <Notice tone="error" message={openError} /> : null}
              {actionError ? <Notice tone="error" message={actionError} /> : null}
            </>
          )
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginTop: Space.lg,
  },
  list: {
    gap: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  sheetSection: {
    marginTop: 0,
  },
  flex: {
    flex: 1,
  },
});
