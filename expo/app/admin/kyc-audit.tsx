import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { FileText, History, Search, ShieldCheck, ShieldX, Trash2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  InfoRow,
  Input,
  NavBar,
  Screen,
  SectionTitle,
  SegmentedControl,
  SkeletonCard,
} from '@/components/ui';
import type { Tone } from '@/components/ui';
import { Notice, RoleGate, Sheet, formatDateTime, fullName, plural, roleLabel } from '@/components/backoffice';
import { withErrorBoundary } from '@/components/CriticalScreenErrorBoundary';
import { kycAuditService, KYCAuditAction, KYCAuditEntry } from '@/services/kycAuditService';
import { UserRecord, userService } from '@/services/userService';
import { logger } from '@/utils/logger';

type Range = '7' | '30' | '90';

const ACTION_META: Record<KYCAuditAction, { label: string; tone: Tone; icon: LucideIcon; color: string }> = {
  upload: { label: 'Upload', tone: 'info', icon: FileText, color: Colors.info },
  review: { label: 'Review', tone: 'neutral', icon: History, color: Colors.textSecondary },
  approve: { label: 'Approved', tone: 'success', icon: ShieldCheck, color: Colors.success },
  reject: { label: 'Rejected', tone: 'error', icon: ShieldX, color: Colors.error },
  delete: { label: 'Deleted', tone: 'error', icon: Trash2, color: Colors.error },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  id: 'Government ID',
  license: 'Security license',
  insurance: 'Insurance',
  vehicle: 'Vehicle document',
  outfit: 'Outfit photo',
  photo: 'Profile photo',
};

const metaFor = (action: string) => ACTION_META[action as KYCAuditAction] ?? ACTION_META.review;

function describe(entry: KYCAuditEntry): string {
  if (entry.action === 'upload') {
    const type = String(entry.metadata?.documentType ?? '');
    return `Uploaded ${DOC_TYPE_LABEL[type]?.toLowerCase() ?? 'a document'}`;
  }
  if (entry.action === 'approve') return 'Verification approved';
  if (entry.action === 'reject') return 'Verification rejected';
  if (entry.action === 'delete') return 'Document deleted';
  return 'Reviewed';
}

function AdminKYCAuditRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['admin']} nav>
        <AdminKYCAuditScreen />
      </RoleGate>
    </>
  );
}

function AdminKYCAuditScreen() {
  const [range, setRange] = useState<Range>('30');
  const [entries, setEntries] = useState<KYCAuditEntry[] | null>(null);
  const [people, setPeople] = useState<Record<string, UserRecord>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<KYCAuditEntry | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - Number(range));
      // Con cota inferior de fecha y limite: nunca la coleccion completa.
      const list = await kycAuditService.getEntriesSince(since, 300);
      setEntries(list);
      setPeople(await userService.getUsersByIds(list.flatMap((e) => [e.userId, e.reviewerId])));
    } catch (e) {
      logger.error('[KYCAudit] Failed to load audit trail', e);
      setError('The audit trail could not be loaded.');
      setEntries((prev) => prev ?? []);
    }
  }, [range]);

  useEffect(() => {
    setEntries(null);
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const nameOf = useCallback((id?: string) => (id && people[id] ? fullName(people[id]) : id ? `ID ${id.slice(0, 8)}…` : '—'), [people]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries ?? [];
    return (entries ?? []).filter((e) =>
      [e.userId, e.reviewerId, e.documentId, e.action, e.notes, nameOf(e.userId), nameOf(e.reviewerId)].some((v) =>
        (v ?? '').toLowerCase().includes(q)
      )
    );
  }, [entries, search, nameOf]);

  const counts = useMemo(() => {
    const list = entries ?? [];
    return {
      uploads: list.filter((e) => e.action === 'upload').length,
      approvals: list.filter((e) => e.action === 'approve').length,
      rejections: list.filter((e) => e.action === 'reject').length,
    };
  }, [entries]);

  return (
    <View style={styles.root}>
      <NavBar title="KYC audit trail" />
      <Screen
        padTop={false}
        keyboard
        contentStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        <View style={styles.header}>
          <AppText variant="title2">Audit trail</AppText>
          <AppText variant="callout">Every document upload and verification decision. Entries can’t be edited or deleted.</AppText>
        </View>

        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />

        <Input
          icon={Search}
          placeholder="Search name, ID or note"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search the audit trail"
          containerStyle={styles.search}
        />

        {entries && entries.length > 0 ? (
          <View style={styles.summary}>
            <Badge label={plural(counts.uploads, 'upload')} tone="info" />
            <Badge label={`${counts.approvals} approved`} tone="success" />
            <Badge label={`${counts.rejections} rejected`} tone="error" />
          </View>
        ) : null}

        {error ? <Notice tone="error" message={error} actionLabel="Try again" onAction={load} style={styles.block} /> : null}

        <SectionTitle title={search.trim() ? plural(visible.length, 'result') : `Last ${range} days`} />

        {entries === null ? (
          <>
            <SkeletonCard media lines={1} />
            <SkeletonCard media lines={1} />
            <SkeletonCard media lines={1} />
          </>
        ) : visible.length === 0 ? (
          error ? null : (
            <EmptyState
              icon={History}
              title={entries.length === 0 ? 'No activity in this period' : 'No matches'}
              message={entries.length === 0 ? 'Uploads and decisions will appear here.' : 'Try another search.'}
            />
          )
        ) : (
          <View style={styles.list}>
            {visible.map((entry, index) => {
              const meta = metaFor(entry.action);
              return (
                <Card
                  key={entry.id ?? `${entry.documentId}-${index}`}
                  onPress={() => setSelected(entry)}
                  accessibilityLabel={`${describe(entry)} for ${nameOf(entry.userId)}`}
                  style={styles.row}
                >
                  <View style={[styles.icon, { backgroundColor: Colors.surfaceLight }]}>
                    <meta.icon size={18} color={meta.color} strokeWidth={ICON_STROKE} />
                  </View>
                  <View style={styles.flex}>
                    <AppText variant="headline" numberOfLines={1}>
                      {nameOf(entry.userId)}
                    </AppText>
                    <AppText variant="footnote" numberOfLines={1}>
                      {describe(entry)}
                      {entry.reviewerId ? ` · by ${nameOf(entry.reviewerId)}` : ''}
                    </AppText>
                    <AppText variant="caption" color={Colors.textTertiary}>
                      {formatDateTime(entry.timestamp)}
                    </AppText>
                  </View>
                  <Badge label={meta.label} tone={meta.tone} />
                </Card>
              );
            })}
            {entries.length >= 300 ? (
              <AppText variant="caption" color={Colors.textTertiary} align="center">
                Showing the latest 300 entries. Choose a shorter range to see older detail.
              </AppText>
            ) : null}
          </View>
        )}
      </Screen>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Audit entry"
        title={selected ? describe(selected) : ''}
        subtitle={selected ? formatDateTime(selected.timestamp) : undefined}
      >
        {selected ? (
          <>
            <View>
              <InfoRow label="Action" value={<Badge label={metaFor(selected.action).label} tone={metaFor(selected.action).tone} />} />
              <InfoRow label="Guard" value={nameOf(selected.userId)} />
              {selected.reviewerId ? (
                <InfoRow
                  label="By"
                  value={`${nameOf(selected.reviewerId)}${selected.reviewerRole ? ` · ${roleLabel(selected.reviewerRole)}` : ''}`}
                />
              ) : null}
              {selected.previousStatus || selected.newStatus ? (
                <InfoRow label="Status" value={`${selected.previousStatus ?? '—'} → ${selected.newStatus ?? '—'}`} />
              ) : null}
            </View>
            {selected.notes ? <Notice tone="info" title="Note" message={selected.notes} /> : null}
            <View style={styles.ids}>
              <AppText variant="overline">Guard ID</AppText>
              <AppText variant="footnote" selectable>
                {selected.userId}
              </AppText>
              <AppText variant="overline" style={styles.idGap}>
                Document
              </AppText>
              <AppText variant="footnote" selectable>
                {selected.documentId}
              </AppText>
            </View>
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
    marginBottom: Space.lg,
  },
  search: {
    marginTop: Space.md,
  },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.md,
  },
  block: {
    marginTop: Space.md,
  },
  list: {
    gap: Space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ids: {
    gap: Space.xs,
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLight,
  },
  idGap: {
    marginTop: Space.sm,
  },
  flex: {
    flex: 1,
  },
});

export default withErrorBoundary(AdminKYCAuditRoute, {
  fallbackMessage: 'KYC audit screen encountered an error. Please try again.',
});
