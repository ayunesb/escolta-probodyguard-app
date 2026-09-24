import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { Notice, RoleGate, Sheet, formatDate, fullName, kycMeta, openDocument } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import i18n from '@/i18n';
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

// Claves de i18n, no textos: la etiqueta se traduce al armar la lista.
const DOC_LABELS: { field: keyof GuardKycRecord; labelKey: 'governmentId' | 'license' | 'insurance' | 'vehicle' }[] = [
  { field: 'governmentIdUrls', labelKey: 'governmentId' },
  { field: 'licenseUrls', labelKey: 'license' },
  { field: 'insuranceUrls', labelKey: 'insurance' },
  { field: 'vehicleDocUrls', labelKey: 'vehicle' },
];

const indexed = (label: string, index: number, total: number) =>
  total > 1 ? i18n.t('backoffice:docs.indexed', { label, index: index + 1, total }) : label;

function documentItems(guard: UserRecord, kyc: GuardKycRecord | null): DocItem[] {
  const items: DocItem[] = [];
  DOC_LABELS.forEach(({ field, labelKey }) => {
    const urls = (kyc?.[field] as string[] | undefined) ?? [];
    const label = i18n.t(`backoffice:docs.${labelKey}`);
    urls.forEach((url, i) => items.push({ key: `${field}-${i}`, label: indexed(label, i, urls.length), url, kind: 'private' }));
  });
  (guard.photos ?? []).forEach((url, i) => items.push({ key: `photo-${i}`, label: i18n.t('backoffice:docs.photo'), url, kind: 'public' }));
  const outfits = guard.outfitPhotos ?? [];
  const outfitLabel = i18n.t('backoffice:docs.outfit');
  outfits.forEach((url, i) => items.push({ key: `outfit-${i}`, label: indexed(outfitLabel, i, outfits.length), url, kind: 'public' }));
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
  const { t } = useTranslation(['backoffice', 'common']);
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [guards, setGuards] = useState<UserRecord[] | null>(null);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
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
      setLoadError(true);
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
        setReasonError(t('adminKyc.reasonError'));
        return;
      }
    } else {
      const ok = await confirm(
        t('adminKyc.approveTitle'),
        t('adminKyc.approveMessage', { name }),
        t('adminKyc.approve'),
        t('common:actions.cancel')
      );
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
      setNotice(decision === 'approved' ? t('adminKyc.approvedNotice', { name }) : t('adminKyc.rejectedNotice', { name }));
      await load();
    } catch (error) {
      logger.error('[AdminKYC] Failed to record KYC decision', error);
      setActionError(t('adminKyc.actionError'));
    } finally {
      setActing(null);
    }
  };

  const open = async (item: DocItem) => {
    setOpenError(null);
    const ok = await openDocument(item.url);
    if (!ok) setOpenError(t('adminKyc.openError', { label: item.label }));
  };

  const list = grouped[tab];
  const docs = selected ? documentItems(selected, selectedKyc) : [];
  const privateDocs = docs.filter((d) => d.kind === 'private');
  const publicDocs = docs.filter((d) => d.kind === 'public');
  const selectedStatus = (selected?.kycStatus ?? 'pending') as Tab;

  return (
    <Screen glow refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>
      <ScreenHeader
        eyebrow={t('adminKyc.eyebrow')}
        title={t('adminKyc.title')}
        subtitle={t('adminKyc.subtitle')}
        right={<IconButton icon={History} onPress={() => router.push('/admin/kyc-audit')} accessibilityLabel={t('adminKyc.auditA11y')} />}
      />

      {/* Con conteos de dos cifras en espanol ("Verificados 12") las tres
          pestanas no caben a 375 px: en vez de recortarse, se desplazan. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          style={styles.tabs}
          options={[
            {
              value: 'pending',
              label: `${t('adminKyc.tabPending')} ${guards ? grouped.pending.length : ''}`.trim(),
              accessibilityLabel: t('adminKyc.tabPendingA11y'),
            },
            {
              value: 'approved',
              label: `${t('adminKyc.tabVerified')} ${guards ? grouped.approved.length : ''}`.trim(),
              accessibilityLabel: t('adminKyc.tabVerifiedA11y'),
            },
            {
              value: 'rejected',
              label: `${t('adminKyc.tabRejected')} ${guards ? grouped.rejected.length : ''}`.trim(),
              accessibilityLabel: t('adminKyc.tabRejectedA11y'),
            },
          ]}
        />
      </ScrollView>

      {notice ? <Notice tone="success" message={notice} onDismiss={() => setNotice(null)} style={styles.notice} /> : null}

      <SectionTitle
        title={tab === 'pending' ? t('adminKyc.sectionPending') : tab === 'approved' ? t('adminKyc.sectionVerified') : t('adminKyc.sectionRejected')}
      />

      {loadError ? (
        <Notice tone="error" message={t('adminKyc.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} />
      ) : guards === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : list.length === 0 ? (
        <EmptyState
          icon={tab === 'rejected' ? ShieldX : ShieldCheck}
          title={tab === 'pending' ? t('adminKyc.emptyPending') : tab === 'approved' ? t('adminKyc.emptyVerified') : t('adminKyc.emptyRejected')}
          message={tab === 'pending' ? t('adminKyc.emptyPendingMessage') : undefined}
        />
      ) : (
        <View style={styles.list}>
          {list.map((guard) => {
            const name = fullName(guard);
            const count = docCounts[guard.id];
            return (
              <Card key={guard.id} onPress={() => openReview(guard)} accessibilityLabel={t('adminKyc.reviewA11y', { name })} style={styles.row}>
                <Avatar name={name} uri={guard.photos?.[0]} size={48} verified={guard.kycStatus === 'approved'} />
                <View style={styles.rowText}>
                  <AppText variant="headline" numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText variant="footnote" numberOfLines={1}>
                    {guard.email}
                  </AppText>
                  <AppText variant="caption" color={Colors.textTertiary}>
                    {guard.companyId ? t('shared.companyGuard') : t('shared.independent')}
                  </AppText>
                  <AppText variant="caption" color={Colors.textTertiary}>
                    {t('adminKyc.updatedOn', { date: formatDate(guard.updatedAt) })}
                  </AppText>
                </View>
                {tab === 'pending' ? (
                  typeof count === 'number' ? (
                    <Badge
                      label={count > 0 ? t('counts.files', { count }) : t('adminKyc.noFiles')}
                      tone={count > 0 ? 'gold' : 'neutral'}
                      style={styles.badgeCenter}
                    />
                  ) : null
                ) : (
                  <Badge {...kycMeta(guard.kycStatus)} style={styles.badgeCenter} />
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
        eyebrow={mode === 'reject' ? t('adminKyc.eyebrowReject') : t('adminKyc.eyebrowReview')}
        title={selected ? fullName(selected) : ''}
        // Espacios duros en el telefono: no se parte a la mitad del numero.
        subtitle={selected ? [selected.email, selected.phone?.replace(/ /g, '\u00A0')].filter(Boolean).join(' · ') : undefined}
        footer={
          !selected ? null : mode === 'reject' ? (
            <>
              <Button title={t('common:actions.back')} variant="secondary" onPress={() => setMode('review')} disabled={!!acting} style={styles.flex} />
              <Button
                title={t('adminKyc.reject')}
                variant="danger"
                icon={ShieldX}
                loading={acting === 'reject'}
                onPress={() => decide('rejected')}
                style={styles.flex}
                accessibilityLabel={t('adminKyc.rejectWithReasonA11y')}
              />
            </>
          ) : (
            <>
              {selectedStatus !== 'rejected' ? (
                <Button
                  title={t('adminKyc.reject')}
                  variant="danger"
                  icon={ShieldX}
                  onPress={() => setMode('reject')}
                  disabled={!!acting}
                  style={styles.flex}
                  accessibilityLabel={t('adminKyc.rejectA11y')}
                />
              ) : null}
              {selectedStatus !== 'approved' ? (
                <Button
                  title={t('adminKyc.approve')}
                  icon={ShieldCheck}
                  loading={acting === 'approve'}
                  disabled={kycState !== 'ready' || privateDocs.length === 0}
                  onPress={() => decide('approved')}
                  style={styles.flex}
                  accessibilityLabel={t('adminKyc.approveTitle')}
                />
              ) : null}
            </>
          )
        }
      >
        {selected ? (
          mode === 'reject' ? (
            <>
              <AppText variant="callout">{t('adminKyc.rejectHelp')}</AppText>
              <Input
                label={t('adminKyc.reason')}
                placeholder={t('adminKyc.reasonPlaceholder')}
                value={reason}
                onChangeText={(v) => {
                  setReason(v);
                  if (reasonError) setReasonError(null);
                }}
                error={reasonError}
                multiline
                maxLength={500}
                autoFocus
                accessibilityLabel={t('adminKyc.reasonA11y')}
              />
              {actionError ? <Notice tone="error" message={actionError} /> : null}
            </>
          ) : (
            <>
              <View style={styles.sheetHeader}>
                <Avatar name={fullName(selected)} uri={selected.photos?.[0]} size={56} verified={selected.kycStatus === 'approved'} />
                <View style={styles.rowText}>
                  <Badge {...kycMeta(selected.kycStatus)} />
                  <View>
                    <AppText variant="caption" color={Colors.textTertiary}>
                      {selected.companyId ? t('shared.companyGuard') : t('shared.independentGuard')}
                    </AppText>
                    <AppText variant="caption" color={Colors.textTertiary}>
                      {t('adminKyc.joinedOn', { date: formatDate(selected.createdAt) })}
                    </AppText>
                  </View>
                </View>
              </View>

              {selectedKyc?.rejectionReason && selectedStatus === 'rejected' ? (
                <Notice tone="warning" title={t('adminKyc.previousRejection')} message={selectedKyc.rejectionReason} />
              ) : null}

              <View>
                <SectionTitle title={t('adminKyc.verificationDocs')} style={styles.sheetSection} />
                {kycState === 'loading' ? (
                  <SkeletonCard lines={2} />
                ) : kycState === 'error' ? (
                  <Notice
                    tone="error"
                    message={t('adminKyc.privateDocsError')}
                    actionLabel={t('common:actions.tryAgain')}
                    onAction={() => openReview(selected)}
                  />
                ) : privateDocs.length === 0 ? (
                  <Notice tone="info" message={t('adminKyc.noPrivateDocs')} />
                ) : (
                  <ListGroup>
                    {privateDocs.map((d) => (
                      <ListRow
                        key={d.key}
                        icon={d.key.startsWith('governmentId') ? IdCard : FileText}
                        title={d.label}
                        subtitle={t('adminKyc.opensFile')}
                        onPress={() => open(d)}
                        accessibilityHint={t('adminKyc.opensDocHint')}
                      />
                    ))}
                  </ListGroup>
                )}
              </View>

              {publicDocs.length > 0 ? (
                <View>
                  <SectionTitle title={t('adminKyc.publicPhotos')} style={styles.sheetSection} />
                  <ListGroup>
                    {publicDocs.map((d) => (
                      <ListRow key={d.key} icon={Camera} title={d.label} onPress={() => open(d)} accessibilityHint={t('adminKyc.opensPhotoHint')} />
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
  tabsScroll: {
    flexGrow: 0,
    marginHorizontal: -Space.gutter,
  },
  // flexGrow: la barra ocupa todo el ancho cuando cabe, como antes.
  tabsContent: {
    flexGrow: 1,
    paddingHorizontal: Space.gutter,
  },
  tabs: {
    flexGrow: 1,
  },
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
  // Badge trae alignSelf: 'flex-start'; en una fila centrada se ve subido.
  badgeCenter: {
    alignSelf: 'center',
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
