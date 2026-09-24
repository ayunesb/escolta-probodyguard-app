import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import {
  Building2,
  CircleDot,
  Download,
  FileText,
  Globe,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, Avatar, Badge, Button, Card, Chip, Input, ListGroup, ListRow, Screen, ScreenHeader, SectionTitle } from '@/components/ui';
import { Notice, exportMyData, fullName, kycMeta, roleLabel } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRecord } from '@/services/userService';
import type { Language, User } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { confirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

const LANGUAGE_LABEL: Record<string, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
};

type NoticeState = { tone: 'success' | 'error' | 'info'; message: string } | null;

export default function ProfileScreen() {
  const { user, signOut, resetPassword } = useAuth();
  const router = useRouter();
  const [notice, setNotice] = useState<NoticeState>(null);
  const [exporting, setExporting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const profile = user as UserRecord | null;
  const name = fullName(profile);
  const role = profile?.role;
  const isGuard = role === 'guard';
  const kyc = kycMeta(profile?.kycStatus);
  const version = Constants.expoConfig?.version;

  const handleExport = async () => {
    if (!profile || exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      const { message, partial } = await exportMyData(profile.id);
      if (message) setNotice({ tone: partial ? 'info' : 'success', message });
    } catch (error) {
      logger.error('[Profile] Data export failed', error);
      setNotice({ tone: 'error', message: 'Your data could not be exported. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!profile?.email || sendingReset) return;
    setSendingReset(true);
    setNotice(null);
    try {
      const result = await resetPassword(profile.email);
      setNotice(
        result.success
          ? { tone: 'success', message: `We sent a password reset link to ${profile.email}.` }
          : { tone: 'error', message: result.error ?? 'We could not send the reset email.' }
      );
    } finally {
      setSendingReset(false);
    }
  };

  const handleSignOut = async () => {
    const ok = await confirm('Sign out?', 'You will need your email and password to sign back in.', 'Sign out', 'Cancel', true);
    if (!ok) return;
    setSigningOut(true);
    await signOut();
    router.replace('/auth/sign-in');
  };

  return (
    <Screen glow keyboard>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader eyebrow={roleLabel(role)} title="Profile" />

      <Card style={styles.identity}>
        <Avatar name={name} uri={profile?.photos?.[0]} size={64} verified={isGuard && profile?.kycStatus === 'approved'} />
        <View style={styles.identityText}>
          <AppText variant="title2" numberOfLines={2}>
            {role === 'company' && profile?.companyName ? profile.companyName : name}
          </AppText>
          {role === 'company' && profile?.companyName ? (
            <AppText variant="footnote" numberOfLines={1}>
              {name}
            </AppText>
          ) : null}
          <View style={styles.badges}>
            <Badge label={roleLabel(role)} tone="gold" />
            {isGuard ? <Badge label={kyc.label} tone={kyc.tone} icon={ShieldCheck} /> : null}
          </View>
        </View>
      </Card>

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.notice} /> : null}

      <SectionTitle title="Account" />
      <ListGroup>
        <ListRow icon={Mail} title="Email" value={profile?.email || '—'} />
        <ListRow icon={Phone} title="Phone" value={profile?.phone || '—'} />
        <ListRow
          icon={Globe}
          title="Language"
          value={profile?.language ? LANGUAGE_LABEL[profile.language] ?? String(profile.language).toUpperCase() : '—'}
        />
        {role === 'company' ? <ListRow icon={Building2} title="Company" value={profile?.companyName || '—'} /> : null}
      </ListGroup>

      {isGuard && profile ? <ProtectorProfileSection guard={profile} /> : null}

      {isGuard ? (
        <>
          <SectionTitle title="Verification" />
          <ListGroup>
            <ListRow
              icon={ShieldCheck}
              title="My documents"
              subtitle={
                profile?.kycStatus === 'approved'
                  ? 'Verified — view or update your files'
                  : profile?.kycStatus === 'rejected'
                  ? 'Not approved — upload updated files'
                  : 'Upload your ID and license for review'
              }
              onPress={() => router.push('/kyc-documents')}
            />
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title="Security" />
      <ListGroup>
        <ListRow
          icon={KeyRound}
          title="Reset password"
          subtitle={profile?.email ? `Email a reset link to ${profile.email}` : undefined}
          onPress={handleResetPassword}
          trailing={sendingReset ? <ActivityIndicator size="small" color={Colors.gold} /> : undefined}
          showChevron={!sendingReset}
        />
      </ListGroup>

      <SectionTitle title="Privacy" />
      <ListGroup>
        <ListRow
          icon={SlidersHorizontal}
          title="Privacy & data"
          subtitle="Consent preferences and account deletion"
          onPress={() => router.push('/privacy-settings')}
        />
        <ListRow icon={FileText} title="Privacy policy" onPress={() => router.push('/privacy-policy')} />
        <ListRow
          icon={Download}
          title="Export my data"
          subtitle="A copy of your profile, bookings and messages (JSON)"
          onPress={handleExport}
          trailing={exporting ? <ActivityIndicator size="small" color={Colors.gold} /> : undefined}
          showChevron={!exporting}
        />
      </ListGroup>

      <SectionTitle title="Session" />
      <ListGroup>
        <ListRow
          icon={LogOut}
          title={signingOut ? 'Signing out…' : 'Sign out'}
          destructive
          onPress={handleSignOut}
          showChevron={false}
        />
        <ListRow
          icon={Trash2}
          title="Delete account"
          subtitle="Request deletion of your account and data"
          destructive
          onPress={() => router.push('/privacy-settings')}
        />
      </ListGroup>

      <AppText variant="caption" color={Colors.textTertiary} align="center" style={styles.version}>
        Escolta Pro{version ? ` · Version ${version}` : ''}
      </AppText>
    </Screen>
  );
}

const LANGUAGE_OPTIONS: Language[] = ['es', 'en', 'fr', 'de'];

type GuardProfile = UserRecord & { bio?: string; languages?: Language[] };

// Lo que un escolta controla de su ficha publica. El listado de clientes solo
// muestra escoltas verificados, con availability === true (booleano) y una
// tarifa positiva; antes no habia pantalla para fijar nada de eso.
function ProtectorProfileSection({ guard }: { guard: GuardProfile }) {
  const { updateUser } = useAuth();
  const available = guard.availability === true;
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [rate, setRate] = useState('');
  const [bio, setBio] = useState('');
  const [languages, setLanguages] = useState<Language[]>([]);
  const [rateError, setRateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const savedRate = typeof guard.hourlyRate === 'number' && guard.hourlyRate > 0 ? guard.hourlyRate : null;
  const savedLanguages = Array.isArray(guard.languages) ? guard.languages : guard.language ? [guard.language] : [];
  const savedLangKey = savedLanguages.join(',');

  useEffect(() => {
    setRate(savedRate !== null ? String(savedRate) : '');
    setBio(typeof guard.bio === 'string' ? guard.bio : '');
    setLanguages(savedLangKey ? (savedLangKey.split(',') as Language[]) : []);
  }, [savedRate, guard.bio, savedLangKey]);

  const toggleAvailability = async (value: boolean) => {
    setSavingAvailability(true);
    setAvailabilityError(null);
    try {
      await updateUser({ availability: value } as unknown as Partial<User>);
    } catch (error) {
      logger.error('[Profile] Failed to update availability', error);
      setAvailabilityError('Your availability could not be changed. Please try again.');
    } finally {
      setSavingAvailability(false);
    }
  };

  const toggleLanguage = (lang: Language) => {
    setSaveResult(null);
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const save = async () => {
    const parsed = Number(rate.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRateError('Enter your rate in MXN, greater than 0');
      return;
    }
    setRateError(null);
    setSaving(true);
    setSaveResult(null);
    try {
      await updateUser({
        hourlyRate: Math.round(parsed * 100) / 100,
        bio: bio.trim(),
        languages: languages.length ? languages : savedLanguages,
      } as unknown as Partial<User>);
      setSaveResult({ tone: 'success', message: 'Your protector profile was saved.' });
    } catch (error) {
      logger.error('[Profile] Failed to save protector profile', error);
      setSaveResult({ tone: 'error', message: 'Your changes could not be saved. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const listedHint =
    guard.kycStatus !== 'approved'
      ? 'You appear to clients once your documents are verified.'
      : savedRate === null
      ? 'Set your hourly rate to appear to clients.'
      : available
      ? 'Clients can find and book you.'
      : 'You are hidden from new bookings.';

  return (
    <>
      <SectionTitle title="Protector profile" />
      <ListGroup>
        <ListRow
          icon={CircleDot}
          title="Available for new jobs"
          subtitle={listedHint}
          showChevron={false}
          trailing={
            savingAvailability ? (
              <ActivityIndicator size="small" color={Colors.gold} />
            ) : (
              <Switch
                value={available}
                onValueChange={toggleAvailability}
                trackColor={{ false: Colors.borderStrong, true: Colors.goldDark }}
                thumbColor={available ? Colors.goldLight : Colors.textSecondary}
                ios_backgroundColor={Colors.borderStrong}
                accessibilityLabel="Available for new jobs"
              />
            )
          }
        />
      </ListGroup>
      {availabilityError ? <Notice tone="error" message={availabilityError} style={styles.notice} /> : null}

      <Card style={styles.protectorCard}>
        <Input
          label="Hourly rate (MXN)"
          placeholder="e.g. 250"
          value={rate}
          onChangeText={(t) => {
            setRate(t);
            setSaveResult(null);
            if (rateError) setRateError(null);
          }}
          error={rateError}
          hint={savedRate !== null ? `Currently ${formatMXN(savedRate)} per hour, before fees.` : 'What clients pay per hour, before fees.'}
          keyboardType="decimal-pad"
          accessibilityLabel="Hourly rate in pesos"
        />
        <Input
          label="About you"
          placeholder="Experience, specialties, certifications…"
          value={bio}
          onChangeText={(t) => {
            setBio(t);
            setSaveResult(null);
          }}
          multiline
          maxLength={400}
          accessibilityLabel="Short bio shown to clients"
        />
        <View style={styles.langs}>
          <AppText variant="caption" color={Colors.textSecondary}>
            Languages you speak
          </AppText>
          <View style={styles.langChips}>
            {LANGUAGE_OPTIONS.map((lang) => (
              <Chip key={lang} label={LANGUAGE_LABEL[lang]} selected={languages.includes(lang)} onPress={() => toggleLanguage(lang)} />
            ))}
          </View>
        </View>
        {saveResult ? <Notice tone={saveResult.tone} message={saveResult.message} /> : null}
        <Button title="Save protector profile" variant="secondary" onPress={save} loading={saving} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  protectorCard: {
    gap: Space.lg,
    marginTop: Space.md,
  },
  langs: {
    gap: Space.sm,
  },
  langChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  identityText: {
    flex: 1,
    gap: Space.xs,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  notice: {
    marginTop: Space.lg,
  },
  version: {
    marginTop: Space.xxxl,
  },
});
