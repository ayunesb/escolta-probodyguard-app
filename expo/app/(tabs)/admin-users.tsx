import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pencil, Search, ShieldCheck, UserCheck, Users, UserX } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  Screen,
  ScreenHeader,
  SectionTitle,
  SkeletonCard,
} from '@/components/ui';
import type { Tone } from '@/components/ui';
import { Notice, RoleGate, Sheet, formatDate, fullName, kycMeta, roleLabel } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { isSuspended, UserRecord, userService } from '@/services/userService';
import type { UserRole } from '@/types';
import { confirm } from '@/utils/confirm';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';

type Filter = 'all' | 'client' | 'guard' | 'company' | 'suspended';

const ROLE_TONE: Record<UserRole, Tone> = {
  client: 'info',
  guard: 'gold',
  company: 'neutral',
  admin: 'neutral',
};

// La etiqueta de cada filtro es backoffice:adminUsers.filters.<valor>.
const FILTERS: Filter[] = ['all', 'client', 'guard', 'company', 'suspended'];

const normalize = (s: unknown) =>
  (typeof s === 'string' ? s : '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export default function AdminUsersRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['admin']}>
        <AdminUsersScreen />
      </RoleGate>
    </>
  );
}

function AdminUsersScreen() {
  const { t } = useTranslation(['backoffice', 'common']);
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Edicion
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', hourlyRate: '' });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [clients, guards, companies] = await Promise.all([
        userService.listByRole('client'),
        userService.listByRole('guard'),
        userService.listByRole('company'),
      ]);
      const all = [...clients, ...guards, ...companies].sort((a, b) => fullName(a).localeCompare(fullName(b)));
      setUsers(all);
    } catch (error) {
      logger.error('[AdminUsers] Failed to load users', error);
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

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, client: 0, guard: 0, company: 0, suspended: 0 };
    (users ?? []).forEach((u) => {
      c.all++;
      if (u.role in c) c[u.role as Filter]++;
      if (isSuspended(u)) c.suspended++;
    });
    return c;
  }, [users]);

  const visible = useMemo(() => {
    const q = normalize(search.trim());
    return (users ?? []).filter((u) => {
      if (filter === 'suspended' ? !isSuspended(u) : filter !== 'all' && u.role !== filter) return false;
      if (!q) return true;
      return [fullName(u), u.email, u.phone, u.companyName, u.id].some((v) => normalize(v).includes(q));
    });
  }, [users, search, filter]);

  const toggleSuspension = async (u: UserRecord) => {
    const suspend = !isSuspended(u);
    const name = fullName(u);
    const ok = await confirm(
      suspend ? t('adminUsers.suspendTitle', { name }) : t('adminUsers.reinstateTitle', { name }),
      suspend ? t('adminUsers.suspendMessage') : t('adminUsers.reinstateMessage'),
      suspend ? t('adminUsers.suspend') : t('adminUsers.reinstate'),
      t('common:actions.cancel'),
      suspend
    );
    if (!ok) return;
    setBusyId(u.id);
    setNotice(null);
    try {
      await userService.setSuspended(u.id, suspend);
      setUsers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, suspended: suspend, isActive: !suspend } : x)));
      setNotice({
        tone: 'success',
        message: suspend ? t('adminUsers.suspendedNotice', { name }) : t('adminUsers.reinstatedNotice', { name }),
      });
    } catch (error) {
      logger.error('[AdminUsers] Failed to change suspension', error);
      setNotice({
        tone: 'error',
        message: suspend ? t('adminUsers.suspendError', { name }) : t('adminUsers.reinstateError', { name }),
      });
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (u: UserRecord) => {
    setEditing(u);
    setForm({
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      phone: u.phone ?? '',
      hourlyRate: typeof u.hourlyRate === 'number' && u.hourlyRate > 0 ? String(u.hourlyRate) : '',
    });
    setFormErrors({});
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const errors: typeof formErrors = {};
    if (!form.firstName.trim()) errors.firstName = t('shared.required');
    if (!form.lastName.trim()) errors.lastName = t('shared.required');
    if (!form.phone.trim()) errors.phone = t('shared.required');
    let hourlyRate: number | undefined;
    if (editing.role === 'guard' && form.hourlyRate.trim()) {
      hourlyRate = Number(form.hourlyRate.replace(',', '.'));
      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) errors.hourlyRate = t('shared.rateInvalid');
    }
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setSaveError(null);
    try {
      const updates = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        ...(hourlyRate !== undefined ? { hourlyRate: Math.round(hourlyRate * 100) / 100 } : {}),
      };
      await userService.updateUserFields(editing.id, updates);
      setUsers((prev) => (prev ?? []).map((x) => (x.id === editing.id ? { ...x, ...updates } : x)));
      setNotice({ tone: 'success', message: t('adminUsers.updated', { name: `${updates.firstName} ${updates.lastName}` }) });
      setEditing(null);
    } catch (error) {
      logger.error('[AdminUsers] Failed to update user', error);
      setSaveError(t('adminUsers.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen glow keyboard refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>
      <ScreenHeader
        eyebrow={t('adminUsers.eyebrow')}
        title={t('adminUsers.title')}
        subtitle={
          users
            ? t('adminUsers.subtitle', {
                accounts: t('counts.accounts', { count: counts.all }),
                suspended: t('adminUsers.suspendedCount', { count: counts.suspended }),
              })
            : t('adminUsers.subtitleFallback')
        }
      />

      <Input
        icon={Search}
        placeholder={t('adminUsers.search')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={t('adminUsers.searchA11y')}
        clearButtonMode="while-editing"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={t(`adminUsers.filters.${f}`)}
            count={users ? counts[f] : undefined}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.notice} /> : null}

      <SectionTitle title={search.trim() ? t('counts.results', { count: visible.length }) : t(`adminUsers.filters.${filter}`)} />

      {loadError ? (
        <Notice tone="error" message={t('adminUsers.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} />
      ) : users === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title={users.length === 0 ? t('adminUsers.emptyTitle') : t('shared.noMatches')}
          message={users.length === 0 ? t('adminUsers.emptyMessage') : t('adminUsers.noMatchesMessage')}
          actionLabel={users.length > 0 && (search || filter !== 'all') ? t('adminUsers.clearSearch') : undefined}
          onAction={() => {
            setSearch('');
            setFilter('all');
          }}
        />
      ) : (
        <View style={styles.list}>
          {visible.map((u) => {
            const name = fullName(u);
            const suspended = isSuspended(u);
            const kyc = kycMeta(u.kycStatus);
            return (
              <Card key={u.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Avatar name={name} uri={u.photos?.[0]} size={44} verified={u.role === 'guard' && u.kycStatus === 'approved'} />
                  <View style={styles.cardText}>
                    <AppText variant="headline" numberOfLines={1}>
                      {u.role === 'company' && u.companyName ? u.companyName : name}
                    </AppText>
                    <AppText variant="footnote" numberOfLines={1}>
                      {u.email || '—'}
                    </AppText>
                  </View>
                </View>

                <View style={styles.badges}>
                  <Badge label={roleLabel(u.role)} tone={ROLE_TONE[u.role] ?? 'neutral'} />
                  <Badge label={suspended ? t('adminUsers.suspended') : t('adminUsers.active')} tone={suspended ? 'error' : 'success'} />
                  {u.role === 'guard' ? <Badge label={kyc.label} tone={kyc.tone} icon={ShieldCheck} /> : null}
                </View>

                <AppText variant="caption" color={Colors.textTertiary}>
                  {[
                    u.phone || null,
                    u.role === 'guard'
                      ? typeof u.hourlyRate === 'number' && u.hourlyRate > 0
                        ? t('shared.ratePerHour', { amount: formatMXN(u.hourlyRate) })
                        : t('shared.rateNotSet')
                      : null,
                    t('shared.joined', { date: formatDate(u.createdAt) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>

                <View style={styles.actions}>
                  <Button
                    title={t('common:actions.edit')}
                    icon={Pencil}
                    variant="secondary"
                    size="sm"
                    onPress={() => startEdit(u)}
                    style={styles.flex}
                    accessibilityLabel={t('adminUsers.editA11y', { name })}
                  />
                  <Button
                    title={suspended ? t('adminUsers.reinstate') : t('adminUsers.suspend')}
                    icon={suspended ? UserCheck : UserX}
                    variant={suspended ? 'outline' : 'danger'}
                    size="sm"
                    loading={busyId === u.id}
                    disabled={u.id === me?.id}
                    onPress={() => toggleSuspension(u)}
                    style={styles.flex}
                    accessibilityLabel={suspended ? t('adminUsers.reinstateA11y', { name }) : t('adminUsers.suspendA11y', { name })}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        dismissable={!saving}
        eyebrow={editing ? roleLabel(editing.role) : undefined}
        title={t('adminUsers.editTitle')}
        subtitle={editing?.email}
        footer={
          <>
            <Button title={t('common:actions.cancel')} variant="secondary" onPress={() => setEditing(null)} disabled={saving} style={styles.flex} />
            <Button title={t('adminUsers.saveChanges')} onPress={saveEdit} loading={saving} style={styles.flex} />
          </>
        }
      >
        <Input
          label={t('shared.firstName')}
          value={form.firstName}
          onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
          error={formErrors.firstName}
          autoCapitalize="words"
        />
        <Input
          label={t('shared.lastName')}
          value={form.lastName}
          onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
          error={formErrors.lastName}
          autoCapitalize="words"
        />
        <Input
          label={t('shared.phone')}
          value={form.phone}
          onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
          error={formErrors.phone}
          keyboardType="phone-pad"
        />
        {editing?.role === 'guard' ? (
          <Input
            label={t('shared.hourlyRate')}
            hint={t('adminUsers.rateHint')}
            value={form.hourlyRate}
            onChangeText={(v) => setForm((f) => ({ ...f, hourlyRate: v }))}
            error={formErrors.hourlyRate}
            keyboardType="decimal-pad"
          />
        ) : null}
        {saveError ? <Notice tone="error" message={saveError} /> : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsScroll: {
    marginTop: Space.md,
    marginHorizontal: -Space.gutter,
  },
  chips: {
    gap: Space.sm,
    paddingHorizontal: Space.gutter,
  },
  notice: {
    marginTop: Space.lg,
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
  cardText: {
    flex: 1,
    gap: 2,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.md,
  },
  flex: {
    flex: 1,
  },
});
