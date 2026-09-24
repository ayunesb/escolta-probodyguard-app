import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
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
import { Notice, RoleGate, Sheet, formatDate, fullName, kycMeta, plural, roleLabel } from '@/components/backoffice';
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

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'client', label: 'Clients' },
  { value: 'guard', label: 'Guards' },
  { value: 'company', label: 'Companies' },
  { value: 'suspended', label: 'Suspended' },
];

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
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
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
      setLoadError('We could not load accounts.');
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
      suspend ? `Suspend ${name}?` : `Reinstate ${name}?`,
      suspend
        ? 'They will be signed out and blocked from using Escolta Pro until you reinstate them.'
        : 'They will be able to sign in and use Escolta Pro again.',
      suspend ? 'Suspend' : 'Reinstate',
      'Cancel',
      suspend
    );
    if (!ok) return;
    setBusyId(u.id);
    setNotice(null);
    try {
      await userService.setSuspended(u.id, suspend);
      setUsers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, suspended: suspend, isActive: !suspend } : x)));
      setNotice({ tone: 'success', message: suspend ? `${name} is suspended.` : `${name} is reinstated.` });
    } catch (error) {
      logger.error('[AdminUsers] Failed to change suspension', error);
      setNotice({ tone: 'error', message: `Could not ${suspend ? 'suspend' : 'reinstate'} ${name}. Nothing changed.` });
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
    if (!form.firstName.trim()) errors.firstName = 'Required';
    if (!form.lastName.trim()) errors.lastName = 'Required';
    if (!form.phone.trim()) errors.phone = 'Required';
    let hourlyRate: number | undefined;
    if (editing.role === 'guard' && form.hourlyRate.trim()) {
      hourlyRate = Number(form.hourlyRate.replace(',', '.'));
      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) errors.hourlyRate = 'Enter a rate in MXN greater than 0';
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
      setNotice({ tone: 'success', message: `${updates.firstName} ${updates.lastName} was updated.` });
      setEditing(null);
    } catch (error) {
      logger.error('[AdminUsers] Failed to update user', error);
      setSaveError('Changes could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen glow keyboard refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}>
      <ScreenHeader
        eyebrow="Admin · Accounts"
        title="Members"
        subtitle={users ? `${plural(counts.all, 'account')} · ${counts.suspended} suspended` : 'Clients, guards and companies'}
      />

      <Input
        icon={Search}
        placeholder="Search name, email, phone or ID"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search accounts"
        clearButtonMode="while-editing"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            count={users ? counts[f.value] : undefined}
            selected={filter === f.value}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </ScrollView>

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.notice} /> : null}

      <SectionTitle title={search.trim() ? `${plural(visible.length, 'result')}` : FILTERS.find((f) => f.value === filter)?.label ?? 'All'} />

      {loadError ? (
        <Notice tone="error" message={loadError} actionLabel="Try again" onAction={load} />
      ) : users === null ? (
        <>
          <SkeletonCard media />
          <SkeletonCard media />
          <SkeletonCard media />
        </>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title={users.length === 0 ? 'No accounts yet' : 'No matches'}
          message={users.length === 0 ? 'New sign-ups will appear here.' : 'Try another name, or clear the filter.'}
          actionLabel={users.length > 0 && (search || filter !== 'all') ? 'Clear search' : undefined}
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
                  <Badge label={suspended ? 'Suspended' : 'Active'} tone={suspended ? 'error' : 'success'} />
                  {u.role === 'guard' ? <Badge label={kyc.label} tone={kyc.tone} icon={ShieldCheck} /> : null}
                </View>

                <AppText variant="caption" color={Colors.textTertiary}>
                  {[
                    u.phone || null,
                    u.role === 'guard'
                      ? typeof u.hourlyRate === 'number' && u.hourlyRate > 0
                        ? `${formatMXN(u.hourlyRate)}/h`
                        : 'Rate not set'
                      : null,
                    `Joined ${formatDate(u.createdAt)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>

                <View style={styles.actions}>
                  <Button title="Edit" icon={Pencil} variant="secondary" size="sm" onPress={() => startEdit(u)} style={styles.flex} accessibilityLabel={`Edit ${name}`} />
                  <Button
                    title={suspended ? 'Reinstate' : 'Suspend'}
                    icon={suspended ? UserCheck : UserX}
                    variant={suspended ? 'outline' : 'danger'}
                    size="sm"
                    loading={busyId === u.id}
                    disabled={u.id === me?.id}
                    onPress={() => toggleSuspension(u)}
                    style={styles.flex}
                    accessibilityLabel={`${suspended ? 'Reinstate' : 'Suspend'} ${name}`}
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
        title="Edit account"
        subtitle={editing?.email}
        footer={
          <>
            <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} disabled={saving} style={styles.flex} />
            <Button title="Save changes" onPress={saveEdit} loading={saving} style={styles.flex} />
          </>
        }
      >
        <Input label="First name" value={form.firstName} onChangeText={(t) => setForm((f) => ({ ...f, firstName: t }))} error={formErrors.firstName} autoCapitalize="words" />
        <Input label="Last name" value={form.lastName} onChangeText={(t) => setForm((f) => ({ ...f, lastName: t }))} error={formErrors.lastName} autoCapitalize="words" />
        <Input label="Phone" value={form.phone} onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))} error={formErrors.phone} keyboardType="phone-pad" />
        {editing?.role === 'guard' ? (
          <Input
            label="Hourly rate (MXN)"
            hint="Leave empty to keep the current rate. Bookings already paid keep their price."
            value={form.hourlyRate}
            onChangeText={(t) => setForm((f) => ({ ...f, hourlyRate: t }))}
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
