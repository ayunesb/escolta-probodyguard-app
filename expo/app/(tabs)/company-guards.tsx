import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
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
import { Notice, RoleGate, Sheet, fullName, kycMeta, plural } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { secondaryAuth, secondaryDb, secondaryRealtimeDb } from '@/lib/firebase';
import { ref, set } from 'firebase/database';
import { UserRecord, userService } from '@/services/userService';
import { confirm } from '@/utils/confirm';
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
  if (lines.length < 2) return { rows: [], errors: ['The file has no data rows.'] };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const required = ['firstname', 'lastname', 'email', 'phone', 'hourlyrate'];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) return { rows: [], errors: [`Missing column(s): ${missing.join(', ')}`] };

  const rows: NewGuardInput[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const get = (key: string) => cells[headers.indexOf(key)] ?? '';
    const hourlyRate = Number(get('hourlyrate'));
    const row = { firstName: get('firstname'), lastName: get('lastname'), email: get('email'), phone: get('phone'), hourlyRate };
    if (!row.firstName || !row.lastName || !EMAIL_RE.test(row.email) || !row.phone || !Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      errors.push(`Row ${i + 1}: missing or invalid data`);
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
  const { user } = useAuth();
  const [guards, setGuards] = useState<UserRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
    try {
      const list = await userService.fetchGuardsForCompany(user.id);
      list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
      setGuards(list);
    } catch (error) {
      logger.error('[CompanyGuards] Failed to load guards', error);
      setLoadError('We could not load your guards.');
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
    if (!user) return inputs.map((g) => ({ email: g.email, success: false, error: 'Not signed in' }));
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
              ? 'Email already in use'
              : code === 'auth/invalid-email'
              ? 'Invalid email'
              : 'Could not create the account',
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
    if (!form.firstName.trim()) errors.firstName = 'Required';
    if (!form.lastName.trim()) errors.lastName = 'Required';
    if (!EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email';
    if (!form.phone.trim()) errors.phone = 'Required';
    if (!Number.isFinite(rate) || rate <= 0) errors.hourlyRate = 'Enter a rate in MXN greater than 0';
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
        setCreateError(result.error ?? 'Could not create the account.');
        return;
      }
      setAddOpen(false);
      setNotice({ tone: 'success', message: `${result.email} was added and emailed a link to set their password.` });
      await load();
    } finally {
      setCreating(false);
    }
  };

  const removeGuard = async (g: UserRecord) => {
    const name = fullName(g);
    const ok = await confirm(
      `Remove ${name}?`,
      'They keep their Escolta Pro account but leave your company. Their documents stay with them.',
      'Remove',
      'Cancel',
      true
    );
    if (!ok) return;
    setRemovingId(g.id);
    setNotice(null);
    try {
      await userService.removeGuardFromCompany(g.id);
      setGuards((prev) => (prev ?? []).filter((x) => x.id !== g.id));
      setNotice({ tone: 'success', message: `${name} was removed from your company.` });
    } catch (error) {
      logger.error('[CompanyGuards] Failed to remove guard', error);
      setNotice({ tone: 'error', message: `Could not remove ${name}. Please try again.` });
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
      setRateError('Enter a rate in MXN greater than 0');
      return;
    }
    const hourlyRate = Math.round(rate * 100) / 100;
    setSavingRate(true);
    setRateError(null);
    try {
      await userService.updateCompanyGuard(rateGuard.id, { hourlyRate });
      setGuards((prev) => (prev ?? []).map((x) => (x.id === rateGuard.id ? { ...x, hourlyRate } : x)));
      setNotice({ tone: 'success', message: `${fullName(rateGuard)} now charges ${formatMXN(hourlyRate)} per hour.` });
      setRateGuard(null);
    } catch (error) {
      logger.error('[CompanyGuards] Failed to save rate', error);
      setRateError('The rate could not be saved. Please try again.');
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
      setNotice({ tone: 'error', message: 'The file could not be opened.' });
    }
  };

  const runImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await fetch(importFile.uri).then((r) => r.text());
      const { rows, errors } = parseGuardsCSV(text);
      if (rows.length === 0) {
        setImportResult({ created: 0, total: 0, issues: errors.length ? errors : ['No valid rows found in the file.'] });
        return;
      }
      const results = await createGuards(rows);
      const failed = results.filter((r) => !r.success).map((r) => `${r.email}: ${r.error}`);
      setImportResult({ created: results.length - failed.length, total: rows.length, issues: [...errors, ...failed] });
      await load();
    } catch (error) {
      logger.error('[CompanyGuards] CSV import failed', error);
      setImportResult({ created: 0, total: 0, issues: ['The file could not be read. Make sure it is a CSV file.'] });
    } finally {
      setImporting(false);
    }
  };

  const copyFormat = async () => {
    await Clipboard.setStringAsync(CSV_TEMPLATE);
    setFormatCopied(true);
  };

  return (
    <Screen glow keyboard refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>
      <ScreenHeader
        eyebrow="Company · Team"
        title="Guards"
        subtitle={guards ? `${plural(guards.length, 'guard')} · ${available} available now` : 'Your security team'}
        right={
          <View style={styles.headerActions}>
            <IconButton icon={Upload} onPress={pickCSV} accessibilityLabel="Import guards from a CSV file" />
            <IconButton icon={UserPlus} tone="gold" onPress={openAdd} accessibilityLabel="Add a guard" />
          </View>
        }
      />

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.block} /> : null}

      {guards && guards.length > 4 ? (
        <Input
          icon={Search}
          placeholder="Search your guards"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search your guards"
        />
      ) : null}

      <SectionTitle title={search.trim() ? plural(visible.length, 'result') : 'Your team'} />

      {loadError ? (
        <Notice tone="error" message={loadError} actionLabel="Try again" onAction={load} />
      ) : guards === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : guards.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No guards yet"
          message="Add each guard with their email — they receive a link to set their password. You can also import a CSV."
          actionLabel="Add a guard"
          onAction={openAdd}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title="No matches" message="Try another name or email." />
      ) : (
        <View style={styles.list}>
          {visible.map((g) => {
            const name = fullName(g);
            const kyc = kycMeta(g.kycStatus);
            const rate = typeof g.hourlyRate === 'number' && g.hourlyRate > 0 ? `${formatMXN(g.hourlyRate)}/h` : 'Rate not set';
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
                </View>
                <View style={styles.badges}>
                  <Badge label={g.availability === true ? 'Available' : 'Offline'} tone={g.availability === true ? 'success' : 'neutral'} />
                  <Badge label={kyc.label} tone={kyc.tone} icon={ShieldCheck} />
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.meta}>
                    <AppText variant="overline">Rate</AppText>
                    <AppText variant="numeric" color={rate === 'Rate not set' ? Colors.textTertiary : Colors.textPrimary}>
                      {rate}
                    </AppText>
                  </View>
                  <View style={styles.meta}>
                    <AppText variant="overline">Jobs</AppText>
                    <AppText variant="numeric">{jobs}</AppText>
                  </View>
                  <View style={styles.meta}>
                    <AppText variant="overline">Rating</AppText>
                    <AppText variant="numeric" color={rating === '—' ? Colors.textTertiary : Colors.textPrimary}>
                      {rating}
                    </AppText>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Button
                    title="Documents"
                    icon={FolderOpen}
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push(`/company-guard-documents/${g.id}`)}
                    style={styles.flex}
                    accessibilityLabel={`Documents for ${name}`}
                  />
                  <Button
                    title={rate === 'Rate not set' ? 'Set rate' : 'Rate'}
                    icon={BadgeDollarSign}
                    variant={rate === 'Rate not set' ? 'outline' : 'secondary'}
                    size="sm"
                    onPress={() => openRate(g)}
                    style={styles.flex}
                    accessibilityLabel={`Set hourly rate for ${name}`}
                  />
                  <Button
                    title="Remove"
                    icon={UserMinus}
                    variant="danger"
                    size="sm"
                    loading={removingId === g.id}
                    onPress={() => removeGuard(g)}
                    style={styles.flex}
                    accessibilityLabel={`Remove ${name} from your company`}
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
        eyebrow="Add a guard"
        title="New team member"
        subtitle="We create their account and email them a link to set a password."
        footer={
          <>
            <Button title="Cancel" variant="secondary" onPress={() => setAddOpen(false)} disabled={creating} style={styles.flex} />
            <Button title="Create account" icon={UserPlus} onPress={submitAdd} loading={creating} style={styles.flex} />
          </>
        }
      >
        <Input label="First name" placeholder="Juan" value={form.firstName} onChangeText={(t) => setForm((f) => ({ ...f, firstName: t }))} error={formErrors.firstName} autoCapitalize="words" />
        <Input label="Last name" placeholder="Pérez" value={form.lastName} onChangeText={(t) => setForm((f) => ({ ...f, lastName: t }))} error={formErrors.lastName} autoCapitalize="words" />
        <Input
          label="Email"
          placeholder="guard@example.com"
          value={form.email}
          onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
          error={formErrors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input label="Phone" placeholder="+52 55 1234 5678" value={form.phone} onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))} error={formErrors.phone} keyboardType="phone-pad" />
        <Input
          label="Hourly rate (MXN)"
          placeholder="180"
          value={form.hourlyRate}
          onChangeText={(t) => setForm((f) => ({ ...f, hourlyRate: t }))}
          error={formErrors.hourlyRate}
          keyboardType="decimal-pad"
          hint="What clients pay per hour for this guard, before fees."
        />
        {createError ? <Notice tone="error" message={createError} /> : null}
      </Sheet>

      <Sheet
        visible={!!rateGuard}
        onClose={() => setRateGuard(null)}
        dismissable={!savingRate}
        eyebrow="Hourly rate"
        title={rateGuard ? fullName(rateGuard) : ''}
        subtitle="What clients pay per hour for this guard, before fees. Bookings already paid keep their price."
        footer={
          <>
            <Button title="Cancel" variant="secondary" onPress={() => setRateGuard(null)} disabled={savingRate} style={styles.flex} />
            <Button title="Save rate" onPress={saveRate} loading={savingRate} style={styles.flex} />
          </>
        }
      >
        <Input
          label="Rate (MXN per hour)"
          placeholder="180"
          value={rateInput}
          onChangeText={(t) => {
            setRateInput(t);
            if (rateError) setRateError(null);
          }}
          error={rateError}
          keyboardType="decimal-pad"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={saveRate}
        />
        {!rateGuard || (typeof rateGuard.hourlyRate === 'number' && rateGuard.hourlyRate > 0) ? null : (
          <Notice tone="info" message="Guards without a rate are not shown to clients." />
        )}
      </Sheet>

      <Sheet
        visible={!!importFile}
        onClose={() => setImportFile(null)}
        dismissable={!importing}
        eyebrow="Import guards"
        title={importResult ? 'Import finished' : 'Import from CSV'}
        footer={
          importResult ? (
            <Button title="Done" variant="secondary" onPress={() => setImportFile(null)} />
          ) : (
            <>
              <Button title="Cancel" variant="secondary" onPress={() => setImportFile(null)} disabled={importing} style={styles.flex} />
              <Button title="Import" icon={Upload} onPress={runImport} loading={importing} style={styles.flex} />
            </>
          )
        }
      >
        {importFile ? (
          <View style={styles.fileRow}>
            <FileSpreadsheet size={20} color={Colors.gold} />
            <View style={styles.flex}>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {importFile.name}
              </AppText>
              {typeof importFile.size === 'number' ? (
                <AppText variant="caption" color={Colors.textTertiary}>
                  {(importFile.size / 1024).toFixed(1)} KB
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
                  ? `${importResult.created} of ${plural(importResult.total, 'guard')} created. Each one was emailed a link to set their password.`
                  : 'No guards were created.'
              }
            />
            {importResult.issues.length > 0 ? (
              <View style={styles.issues}>
                <AppText variant="overline">Issues</AppText>
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
            <AppText variant="callout">One guard per row, with this header. Each guard gets an account and an email to set their password.</AppText>
            <View style={styles.code}>
              <AppText variant="footnote" color={Colors.textPrimary} style={styles.codeText}>
                {CSV_TEMPLATE}
              </AppText>
            </View>
            <Button
              title={formatCopied ? 'Format copied' : 'Copy format'}
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
    gap: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  meta: {
    flex: 1,
    gap: 2,
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
    padding: Space.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
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
