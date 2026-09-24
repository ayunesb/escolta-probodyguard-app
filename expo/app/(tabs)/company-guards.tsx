import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BadgeDollarSign, Copy, FileSpreadsheet, FolderOpen, Search, Shield, ShieldCheck, Upload, UserMinus, UserPlus } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  Screen,
  ScreenHeader,
  SectionTitle,
  SkeletonCard,
} from '@/components/ui';
import { Notice, RoleGate, Sheet, fullName, kycMeta } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { secondaryAuth, secondaryDb, secondaryRealtimeDb } from '@/lib/firebase';
import { ref, set } from 'firebase/database';
import i18n from '@/i18n';
import { UserRecord, userService } from '@/services/userService';
import { confirm } from '@/utils/confirm';
import { formatNumber } from '@/i18n/format';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

function randomTempPassword(): string {
  // Nunca se usa para entrar: se manda sendPasswordResetEmail justo despues
  // de crear la cuenta, asi que solo tiene que cumplir el minimo de Firebase.
  return `Tmp${Math.random().toString(36).slice(2)}${Date.now().toString(36)}!A1`;
}

const CSV_TEMPLATE = 'firstName,lastName,email,phone,hourlyRate\nJuan,Perez,juan.perez@example.com,+525512345678,180';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NewGuardInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  hourlyRate: number;
}

interface CreateGuardResult {
  email: string;
  success: boolean;
  error?: string;
}

type FormState = { firstName: string; lastName: string; email: string; phone: string; hourlyRate: string };
const EMPTY_FORM: FormState = { firstName: '', lastName: '', email: '', phone: '', hourlyRate: '' };

function parseGuardsCSV(text: string): { rows: NewGuardInput[]; errors: string[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: [i18n.t('backoffice:companyGuards.csvNoRows')] };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const required = ['firstname', 'lastname', 'email', 'phone', 'hourlyrate'];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) return { rows: [], errors: [i18n.t('backoffice:companyGuards.csvMissingColumns', { columns: missing.join(', ') })] };

  const rows: NewGuardInput[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const get = (key: string) => cells[headers.indexOf(key)] ?? '';
    const hourlyRate = Number(get('hourlyrate'));
    const row = { firstName: get('firstname'), lastName: get('lastname'), email: get('email'), phone: get('phone'), hourlyRate };
    if (!row.firstName || !row.lastName || !EMAIL_RE.test(row.email) || !row.phone || !Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      errors.push(i18n.t('backoffice:companyGuards.csvBadRow', { row: i + 1 }));
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}

export default function CompanyGuardsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['company']}>
        <CompanyGuardsScreen />
      </RoleGate>
    </>
  );
}

function CompanyGuardsScreen() {
  const router = useRouter();
  const { t } = useTranslation(['backoffice', 'common']);
  const { user } = useAuth();
  const [guards, setGuards] = useState<UserRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Alta individual
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Tarifa
  const [rateGuard, setRateGuard] = useState<UserRecord | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [rateError, setRateError] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  // Importacion CSV
  const [importFile, setImportFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; total: number; issues: string[] } | null>(null);
  const [formatCopied, setFormatCopied] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError(false);
    try {
      const list = await userService.fetchGuardsForCompany(user.id);
      list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
      setGuards(list);
    } catch (error) {
      logger.error('[CompanyGuards] Failed to load guards', error);
      setLoadError(true);
    }
  }, [user]);

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guards ?? [];
    return (guards ?? []).filter((g) => [fullName(g), g.email, g.phone].some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [guards, search]);

  const available = (guards ?? []).filter((g) => g.availability === true).length;

  // Crea cada cuenta con el SDK de cliente en una app de Firebase secundaria
  // (ver lib/firebase.ts): cada escolta se crea con su propia sesion temporal
  // y escribe SU PROPIO perfil, que es lo que permiten las reglas. Los
  // documentos KYC nunca van en este perfil publico (CONTRACT §5).
  const createGuards = async (inputs: NewGuardInput[]): Promise<CreateGuardResult[]> => {
    if (!user) return inputs.map((g) => ({ email: g.email, success: false, error: t('companyGuards.notSignedIn') }));
    const results: CreateGuardResult[] = [];
    for (const g of inputs) {
      try {
        const credential = await createUserWithEmailAndPassword(secondaryAuth(), g.email, randomTempPassword());
        const now = new Date().toISOString();
        await setDoc(doc(secondaryDb(), 'users', credential.user.uid), {
          email: g.email,
          role: 'guard',
          firstName: g.firstName,
          lastName: g.lastName,
          phone: g.phone,
          language: 'es',
          kycStatus: 'pending',
          createdAt: now,
          isActive: true,
          emailVerified: false,
          updatedAt: now,
          bio: '',
          languages: ['es'],
          hourlyRate: g.hourlyRate,
          photos: [],
          outfitPhotos: [],
          certifications: [],
          rating: 0,
          completedJobs: 0,
          isFreelancer: false,
          companyId: user.id,
          availability: false,
        });
        // Espejo del rol en Realtime Database: sin el, las reglas no reconocen
        // a la empresa como duena de las reservas de este escolta.
        await set(ref(secondaryRealtimeDb(), `users/${credential.user.uid}`), { role: 'guard', companyId: user.id }).catch((e) =>
          logger.error('[CompanyGuards] Failed to write guard role mirror', e)
        );
        // Firebase Auth manda este correo con su plantilla propia.
        await sendPasswordResetEmail(secondaryAuth(), g.email).catch((e) =>
          logger.error('[CompanyGuards] Failed to send set-password email', e)
        );
        results.push({ email: g.email, success: true });
      } catch (error) {
        logger.error('[CompanyGuards] Failed to create guard', error);
        const code = (error as { code?: string })?.code;
        results.push({
          email: g.email,
          success: false,
          error:
            code === 'auth/email-already-in-use'
              ? t('companyGuards.emailInUse')
              : code === 'auth/invalid-email'
              ? t('companyGuards.invalidEmail')
              : t('companyGuards.createFailed'),
        });
      } finally {
        await signOut(secondaryAuth()).catch(() => {});
      }
    }
    return results;
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setCreateError(null);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const errors: typeof formErrors = {};
    const rate = Number(form.hourlyRate.replace(',', '.'));
    if (!form.firstName.trim()) errors.firstName = t('shared.required');
    if (!form.lastName.trim()) errors.lastName = t('shared.required');
    if (!EMAIL_RE.test(form.email.trim())) errors.email = t('companyGuards.emailInvalid');
    if (!form.phone.trim()) errors.phone = t('shared.required');
    if (!Number.isFinite(rate) || rate <= 0) errors.hourlyRate = t('shared.rateInvalid');
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setCreating(true);
    setCreateError(null);
    try {
      const [result] = await createGuards([
        {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          hourlyRate: Math.round(rate * 100) / 100,
        },
      ]);
      if (!result.success) {
        setCreateError(result.error ?? t('companyGuards.createFailedFull'));
        return;
      }
      setAddOpen(false);
      setNotice({ tone: 'success', message: t('companyGuards.added', { email: result.email }) });
      await load();
    } finally {
      setCreating(false);
    }
  };

  const removeGuard = async (g: UserRecord) => {
    const name = fullName(g);
    const ok = await confirm(
      t('companyGuards.removeTitle', { name }),
      t('companyGuards.removeMessage'),
      t('companyGuards.remove'),
      t('common:actions.cancel'),
      true
    );
    if (!ok) return;
    setRemovingId(g.id);
    setNotice(null);
    try {
      await userService.removeGuardFromCompany(g.id);
      setGuards((prev) => (prev ?? []).filter((x) => x.id !== g.id));
      setNotice({ tone: 'success', message: t('companyGuards.removed', { name }) });
    } catch (error) {
      logger.error('[CompanyGuards] Failed to remove guard', error);
      setNotice({ tone: 'error', message: t('companyGuards.removeError', { name }) });
    } finally {
      setRemovingId(null);
    }
  };

  const openRate = (g: UserRecord) => {
    setRateGuard(g);
    setRateInput(typeof g.hourlyRate === 'number' && g.hourlyRate > 0 ? String(g.hourlyRate) : '');
    setRateError(null);
  };

  const saveRate = async () => {
    if (!rateGuard) return;
    const rate = Number(rateInput.replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0) {
      setRateError(t('shared.rateInvalid'));
      return;
    }
    const hourlyRate = Math.round(rate * 100) / 100;
    setSavingRate(true);
    setRateError(null);
    try {
      await userService.updateCompanyGuard(rateGuard.id, { hourlyRate });
      setGuards((prev) => (prev ?? []).map((x) => (x.id === rateGuard.id ? { ...x, hourlyRate } : x)));
      setNotice({ tone: 'success', message: t('companyGuards.rateSaved', { name: fullName(rateGuard), amount: formatMXN(hourlyRate) }) });
      setRateGuard(null);
    } catch (error) {
      logger.error('[CompanyGuards] Failed to save rate', error);
      setRateError(t('companyGuards.rateSaveError'));
    } finally {
      setSavingRate(false);
    }
  };

  const pickCSV = async () => {
    setNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setImportResult(null);
        setFormatCopied(false);
        setImportFile(result.assets[0]);
      }
    } catch (error) {
      logger.error('[CompanyGuards] CSV picker failed', error);
      setNotice({ tone: 'error', message: t('companyGuards.fileOpenError') });
    }
  };

  const runImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await fetch(importFile.uri).then((r) => r.text());
      const { rows, errors } = parseGuardsCSV(text);
      if (rows.length === 0) {
        setImportResult({ created: 0, total: 0, issues: errors.length ? errors : [t('companyGuards.csvNoValidRows')] });
        return;
      }
      const results = await createGuards(rows);
      const failed = results.filter((r) => !r.success).map((r) => `${r.email}: ${r.error}`);
      setImportResult({ created: results.length - failed.length, total: rows.length, issues: [...errors, ...failed] });
      await load();
    } catch (error) {
      logger.error('[CompanyGuards] CSV import failed', error);
      setImportResult({ created: 0, total: 0, issues: [t('companyGuards.csvReadError')] });
    } finally {
      setImporting(false);
    }
  };

  const copyFormat = async () => {
    await Clipboard.setStringAsync(CSV_TEMPLATE);
    setFormatCopied(true);
  };

  return (
    <Screen glow keyboard refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>
      <ScreenHeader
        eyebrow={t('companyGuards.eyebrow')}
        title={t('companyGuards.title')}
        subtitle={
          guards
            ? t('companyGuards.subtitle', {
                guards: t('counts.guards', { count: guards.length }),
                available: t('shared.availableNow', { count: available }),
              })
            : t('companyGuards.subtitleFallback')
        }
        right={
          <View style={styles.headerActions}>
            <IconButton icon={Upload} onPress={pickCSV} accessibilityLabel={t('companyGuards.importA11y')} />
            <IconButton icon={UserPlus} tone="accent" onPress={openAdd} accessibilityLabel={t('companyGuards.addGuard')} />
          </View>
        }
      />

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.block} /> : null}

      {guards && guards.length > 4 ? (
        <Input
          icon={Search}
          placeholder={t('companyGuards.search')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('companyGuards.search')}
        />
      ) : null}

      <SectionTitle title={search.trim() ? t('counts.results', { count: visible.length }) : t('companyGuards.yourTeam')} />

      {loadError ? (
        <Notice tone="error" message={t('companyGuards.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} />
      ) : guards === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : guards.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={t('companyGuards.emptyTitle')}
          message={t('companyGuards.emptyMessage')}
          actionLabel={t('companyGuards.addGuard')}
          onAction={openAdd}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title={t('shared.noMatches')} message={t('companyGuards.noMatchesMessage')} />
      ) : (
        <View style={styles.list}>
          {visible.map((g) => {
            const name = fullName(g);
            const kyc = kycMeta(g.kycStatus);
            const hasRate = typeof g.hourlyRate === 'number' && g.hourlyRate > 0;
            const rate = hasRate ? t('shared.ratePerHour', { amount: formatMXN(g.hourlyRate as number) }) : t('shared.rateNotSet');
            const jobs = typeof g.completedJobs === 'number' ? g.completedJobs : 0;
            const rating = typeof g.rating === 'number' && g.rating > 0 ? g.rating.toFixed(1) : '—';
            return (
              <Card key={g.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Avatar name={name} uri={g.photos?.[0]} size={48} verified={g.kycStatus === 'approved'} />
                  <View style={styles.flex}>
                    <AppText variant="headline" numberOfLines={1}>
                      {name}
                    </AppText>
                    <AppText variant="footnote" numberOfLines={1}>
                      {g.email}
                    </AppText>
                  </View>
                  {/* Quitar va aparte de las acciones: con tres botones en una fila
                      las etiquetas se cortaban (sobre todo en espanol). */}
                  {removingId === g.id ? (
                    <View style={styles.removeSlot}>
                      <ActivityIndicator color={Colors.error} size="small" />
                    </View>
                  ) : (
                    <IconButton
                      icon={UserMinus}
                      tone="danger"
                      onPress={() => removeGuard(g)}
                      accessibilityLabel={t('companyGuards.removeA11y', { name })}
                    />
                  )}
                </View>
                <View style={styles.badges}>
                  <Badge
                    label={g.availability === true ? t('shared.available') : t('shared.offline')}
                    tone={g.availability === true ? 'success' : 'neutral'}
                  />
                  <Badge label={kyc.label} tone={kyc.tone} icon={ShieldCheck} />
                </View>
                <View style={styles.metaRow}>
                  <View style={[styles.meta, styles.metaWide]}>
                    <AppText variant="overline" numberOfLines={1}>
                      {t('companyGuards.metaRate')}
                    </AppText>
                    <AppText variant="numeric" color={hasRate ? Colors.textPrimary : Colors.textTertiary}>
                      {rate}
                    </AppText>
                  </View>
                  <View style={[styles.meta, styles.metaNarrow]}>
                    <AppText variant="overline" numberOfLines={1}>
                      {t('companyGuards.metaJobs')}
                    </AppText>
                    <AppText variant="numeric">{jobs}</AppText>
                  </View>
                  <View style={styles.meta}>
                    <AppText variant="overline" numberOfLines={1}>
                      {t('companyGuards.metaRating')}
                    </AppText>
                    <AppText variant="numeric" color={rating === '—' ? Colors.textTertiary : Colors.textPrimary}>
                      {rating}
                    </AppText>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Button
                    title={t('companyGuards.documents')}
                    icon={FolderOpen}
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push(`/company-guard-documents/${g.id}`)}
                    style={styles.flex}
                    accessibilityLabel={t('companyGuards.documentsA11y', { name })}
                  />
                  <Button
                    title={hasRate ? t('companyGuards.rate') : t('companyGuards.setRate')}
                    icon={BadgeDollarSign}
                    variant={hasRate ? 'secondary' : 'outline'}
                    size="sm"
                    onPress={() => openRate(g)}
                    style={styles.flex}
                    accessibilityLabel={t('companyGuards.rateA11y', { name })}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        dismissable={!creating}
        eyebrow={t('companyGuards.addEyebrow')}
        title={t('companyGuards.addTitle')}
        subtitle={t('companyGuards.addSubtitle')}
        footer={
          <>
            <Button title={t('common:actions.cancel')} variant="secondary" onPress={() => setAddOpen(false)} disabled={creating} style={styles.flex} />
            <Button title={t('companyGuards.createAccount')} icon={UserPlus} onPress={submitAdd} loading={creating} style={styles.flex} />
          </>
        }
      >
        <Input
          label={t('shared.firstName')}
          placeholder="Juan"
          value={form.firstName}
          onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
          error={formErrors.firstName}
          autoCapitalize="words"
        />
        <Input
          label={t('shared.lastName')}
          placeholder="Pérez"
          value={form.lastName}
          onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
          error={formErrors.lastName}
          autoCapitalize="words"
        />
        <Input
          label={t('shared.email')}
          placeholder={t('companyGuards.emailPlaceholder')}
          value={form.email}
          onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
          error={formErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label={t('shared.phone')}
          placeholder="+52 55 1234 5678"
          value={form.phone}
          onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
          error={formErrors.phone}
          keyboardType="phone-pad"
        />
        <Input
          label={t('shared.hourlyRate')}
          placeholder="180"
          value={form.hourlyRate}
          onChangeText={(v) => setForm((f) => ({ ...f, hourlyRate: v }))}
          error={formErrors.hourlyRate}
          keyboardType="decimal-pad"
          hint={t('companyGuards.rateHint')}
        />
        {createError ? <Notice tone="error" message={createError} /> : null}
      </Sheet>

      <Sheet
        visible={!!rateGuard}
        onClose={() => setRateGuard(null)}
        dismissable={!savingRate}
        eyebrow={t('companyGuards.rateEyebrow')}
        title={rateGuard ? fullName(rateGuard) : ''}
        subtitle={t('companyGuards.rateSubtitle')}
        footer={
          <>
            <Button title={t('common:actions.cancel')} variant="secondary" onPress={() => setRateGuard(null)} disabled={savingRate} style={styles.flex} />
            <Button title={t('companyGuards.saveRate')} onPress={saveRate} loading={savingRate} style={styles.flex} />
          </>
        }
      >
        <Input
          label={t('companyGuards.rateLabel')}
          placeholder="180"
          value={rateInput}
          onChangeText={(v) => {
            setRateInput(v);
            if (rateError) setRateError(null);
          }}
          error={rateError}
          keyboardType="decimal-pad"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={saveRate}
        />
        {!rateGuard || (typeof rateGuard.hourlyRate === 'number' && rateGuard.hourlyRate > 0) ? null : (
          <Notice tone="info" message={t('companyGuards.noRateNotice')} />
        )}
      </Sheet>

      <Sheet
        visible={!!importFile}
        onClose={() => setImportFile(null)}
        dismissable={!importing}
        eyebrow={t('companyGuards.importEyebrow')}
        title={importResult ? t('companyGuards.importFinished') : t('companyGuards.importTitle')}
        footer={
          importResult ? (
            <Button title={t('common:actions.done')} variant="secondary" onPress={() => setImportFile(null)} style={styles.flex} />
          ) : (
            <>
              <Button title={t('common:actions.cancel')} variant="secondary" onPress={() => setImportFile(null)} disabled={importing} style={styles.flex} />
              <Button title={t('companyGuards.import')} icon={Upload} onPress={runImport} loading={importing} style={styles.flex} />
            </>
          )
        }
      >
        {importFile ? (
          <View style={styles.fileRow}>
            <FileSpreadsheet size={20} color={Colors.accent} />
            <View style={styles.flex}>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {importFile.name}
              </AppText>
              {typeof importFile.size === 'number' ? (
                <AppText variant="caption" color={Colors.textTertiary}>
                  {t('shared.fileSize', { size: formatNumber(importFile.size / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}
        {importResult ? (
          <>
            <Notice
              tone={importResult.created > 0 ? 'success' : 'error'}
              message={
                importResult.total > 0
                  ? t('companyGuards.importResult', { created: importResult.created, count: importResult.total })
                  : t('companyGuards.importNone')
              }
            />
            {importResult.issues.length > 0 ? (
              <View style={styles.issues}>
                <AppText variant="overline">{t('companyGuards.issues')}</AppText>
                {importResult.issues.map((issue) => (
                  <AppText key={issue} variant="footnote">
                    {issue}
                  </AppText>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <AppText variant="callout">{t('companyGuards.importHelp')}</AppText>
            {/* Sin cortes de linea dentro de una fila: se desplaza de lado si no cabe. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.code} contentContainerStyle={styles.codeContent}>
              <AppText variant="footnote" color={Colors.textPrimary} style={styles.codeText}>
                {CSV_TEMPLATE}
              </AppText>
            </ScrollView>
            <Button
              title={formatCopied ? t('companyGuards.formatCopied') : t('companyGuards.copyFormat')}
              icon={Copy}
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={copyFormat}
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  block: {
    marginBottom: Space.lg,
  },
  list: {
    gap: Space.md,
  },
  card: {
    gap: Space.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  // Columnas a la medida de su contenido: "Servicios" y un numero caben en
  // menos; "Calificación" necesita mas que "Rating".
  meta: {
    flex: 1.15,
    minWidth: 0,
    gap: 2,
  },
  metaWide: {
    flex: 1,
  },
  metaNarrow: {
    flex: 0.85,
  },
  removeSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Space.md,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLight,
  },
  code: {
    flexGrow: 0,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  codeContent: {
    padding: Space.md,
  },
  codeText: {
    fontVariant: ['tabular-nums'],
  },
  issues: {
    gap: Space.xs,
  },
  flex: {
    flex: 1,
  },
});
