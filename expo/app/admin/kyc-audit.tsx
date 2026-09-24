import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { Notice, RoleGate, Sheet, formatDateTime, fullName, roleLabel } from '@/components/backoffice';
import { withErrorBoundary } from '@/components/CriticalScreenErrorBoundary';
import i18n from '@/i18n';
import { kycAuditService, KYCAuditAction, KYCAuditEntry } from '@/services/kycAuditService';
import { UserRecord, userService } from '@/services/userService';
import { logger } from '@/utils/logger';

type Range = '7' | '30' | '90';

// Sin textos aqui: la etiqueta es backoffice:kycAudit.actions.<accion>.
const ACTION_META: Record<KYCAuditAction, { tone: Tone; icon: LucideIcon; color: string }> = {
  upload: { tone: 'info', icon: FileText, color: Colors.info },
  review: { tone: 'neutral', icon: History, color: Colors.textSecondary },
  approve: { tone: 'success', icon: ShieldCheck, color: Colors.success },
  reject: { tone: 'error', icon: ShieldX, color: Colors.error },
  delete: { tone: 'error', icon: Trash2, color: Colors.error },
};

const DOC_TYPES = ['id', 'license', 'insurance', 'vehicle', 'outfit', 'photo'] as const;
type DocType = (typeof DOC_TYPES)[number];

const metaFor = (action: string) => {
  const key: KYCAuditAction = action in ACTION_META ? (action as KYCAuditAction) : 'review';
  return { ...ACTION_META[key], label: i18n.t(`backoffice:kycAudit.actions.${key}`) };
};

function describe(entry: KYCAuditEntry): string {
  if (entry.action === 'upload') {
    const type = String(entry.metadata?.documentType ?? '');
    return DOC_TYPES.includes(type as DocType)
      ? i18n.t(`backoffice:kycAudit.uploaded.${type as DocType}`)
      : i18n.t('backoffice:kycAudit.uploaded.other');
  }
  if (entry.action === 'approve') return i18n.t('backoffice:kycAudit.approved');
  if (entry.action === 'reject') return i18n.t('backoffice:kycAudit.rejected');
  if (entry.action === 'delete') return i18n.t('backoffice:kycAudit.deleted');
  return i18n.t('backoffice:kycAudit.reviewed');
}

// Estados KYC del historial ("pending → approved"); un valor desconocido se muestra tal cual.
const statusText = (status?: string | null): string =>
  !status ? '—' : status === 'pending' || status === 'approved' || status === 'rejected' ? i18n.t(`backoffice:kycStatus.${status}`) : status;

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
  const { t } = useTranslation(['backoffice', 'common']);
  const [range, setRange] = useState<Range>('30');
  const [entries, setEntries] = useState<KYCAuditEntry[] | null>(null);
  const [people, setPeople] = useState<Record<string, UserRecord>>({});
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<KYCAuditEntry | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const since = new Date();
      since.setDate(since.getDate() - Number(range));
      // Con cota inferior de fecha y limite: nunca la coleccion completa.
      const list = await kycAuditService.getEntriesSince(since, 300);
      setEntries(list);
      setPeople(await userService.getUsersByIds(list.flatMap((e) => [e.userId, e.reviewerId])));
    } catch (e) {
      logger.error('[KYCAudit] Failed to load audit trail', e);
      setError(true);
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

  const nameOf = useCallback(
    (id?: string) => (id && people[id] ? fullName(people[id]) : id ? t('people.shortId', { id: id.slice(0, 8) }) : '—'),
    [people, t]
  );

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
      <NavBar title={t('kycAudit.nav')} />
      <Screen
        padTop={false}
        keyboard
        contentStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        <View style={styles.header}>
          <AppText variant="title2">{t('kycAudit.title')}</AppText>
          <AppText variant="callout">{t('kycAudit.description')}</AppText>
        </View>

        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: t('shared.days', { count: 7 }) },
            { value: '30', label: t('shared.days', { count: 30 }) },
            { value: '90', label: t('shared.days', { count: 90 }) },
          ]}
        />

        <Input
          icon={Search}
          placeholder={t('kycAudit.search')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('kycAudit.searchA11y')}
          containerStyle={styles.search}
        />

        {entries && entries.length > 0 ? (
          <View style={styles.summary}>
            <Badge label={t('counts.uploads', { count: counts.uploads })} tone="info" />
            <Badge label={t('kycAudit.approvedCount', { count: counts.approvals })} tone="success" />
            <Badge label={t('kycAudit.rejectedCount', { count: counts.rejections })} tone="error" />
          </View>
        ) : null}

        {error ? (
          <Notice tone="error" message={t('kycAudit.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} style={styles.block} />
        ) : null}

        <SectionTitle title={search.trim() ? t('counts.results', { count: visible.length }) : t('kycAudit.lastDays', { count: Number(range) })} />

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
              title={entries.length === 0 ? t('kycAudit.emptyTitle') : t('shared.noMatches')}
              message={entries.length === 0 ? t('kycAudit.emptyMessage') : t('kycAudit.noMatchesMessage')}
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
                  accessibilityLabel={t('kycAudit.entryA11y', { action: describe(entry), name: nameOf(entry.userId) })}
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
                      {entry.reviewerId
                        ? t('kycAudit.byName', { action: describe(entry), name: nameOf(entry.reviewerId) })
                        : describe(entry)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textTertiary}>
                      {formatDateTime(entry.timestamp)}
                    </AppText>
                  </View>
                  <Badge label={meta.label} tone={meta.tone} style={styles.badgeCenter} />
                </Card>
              );
            })}
            {entries.length >= 300 ? (
              <AppText variant="caption" color={Colors.textTertiary} align="center">
                {t('kycAudit.limit', { count: 300 })}
              </AppText>
            ) : null}
          </View>
        )}
      </Screen>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={t('kycAudit.entryEyebrow')}
        title={selected ? describe(selected) : ''}
        subtitle={selected ? formatDateTime(selected.timestamp) : undefined}
      >
        {selected ? (
          <>
            <View>
              <InfoRow label={t('kycAudit.action')} value={<Badge label={metaFor(selected.action).label} tone={metaFor(selected.action).tone} />} />
              <InfoRow label={t('kycAudit.guard')} value={nameOf(selected.userId)} />
              {selected.reviewerId ? (
                <InfoRow
                  label={t('kycAudit.by')}
                  value={`${nameOf(selected.reviewerId)}${selected.reviewerRole ? ` · ${roleLabel(selected.reviewerRole)}` : ''}`}
                />
              ) : null}
              {selected.previousStatus || selected.newStatus ? (
                <InfoRow label={t('kycAudit.status')} value={`${statusText(selected.previousStatus)} → ${statusText(selected.newStatus)}`} />
              ) : null}
            </View>
            {selected.notes ? <Notice tone="info" title={t('kycAudit.note')} message={selected.notes} /> : null}
            <View style={styles.ids}>
              <AppText variant="overline">{t('kycAudit.guardId')}</AppText>
              <AppText variant="footnote" selectable>
                {selected.userId}
              </AppText>
              <AppText variant="overline" style={styles.idGap}>
                {t('kycAudit.document')}
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
  // Badge trae alignSelf: 'flex-start'; en una fila centrada se ve subido.
  badgeCenter: {
    alignSelf: 'center',
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

// Getter: el mensaje se lee al dibujar el fallback, en el idioma activo.
export default withErrorBoundary(AdminKYCAuditRoute, {
  get fallbackMessage() {
    return i18n.t('backoffice:kycAudit.crash');
  },
});
