import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  CircleDot,
  Download,
  FileText,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Avatar, Badge, Button, Card, Chip, Input, ListGroup, ListRow, Screen, ScreenHeader, SectionTitle } from '@/components/ui';
import { Notice, exportMyData, fullName, kycMeta, roleLabel } from '@/components/backoffice';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRecord } from '@/services/userService';
import type { Language, User } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { confirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

// Nombres de idioma en su propio idioma (endonimos): iguales en EN y ES.
const LANGUAGE_LABEL: Record<string, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
};

// react-native-web pinta el pulgar encendido en #009688 salvo que se pase activeThumbColor.
const WEB_SWITCH_ON = Platform.OS === 'web' ? ({ activeThumbColor: Colors.accentLight } as object) : null;

type NoticeState = { tone: 'success' | 'error' | 'info'; message: string } | null;

export default function ProfileScreen() {
  const { user, signOut, resetPassword } = useAuth();
  const router = useRouter();
  const { t } = useTranslation(['account', 'common']);
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
  const displayName = role === 'company' && profile?.companyName ? profile.companyName : name;

  const handleExport = async () => {
    if (!profile || exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      const { message, partial } = await exportMyData(profile.id);
      if (message) setNotice({ tone: partial ? 'info' : 'success', message });
    } catch (error) {
      logger.error('[Profile] Data export failed', error);
      setNotice({ tone: 'error', message: t('profile.notices.exportFailed') });
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
          ? { tone: 'success', message: t('profile.notices.resetSent', { email: profile.email }) }
          : { tone: 'error', message: result.error ?? t('profile.notices.resetFailed') }
      );
    } finally {
      setSendingReset(false);
    }
  };

  const handleSignOut = async () => {
    const ok = await confirm(
      t('profile.signOutConfirm.title'),
      t('profile.signOutConfirm.message'),
      t('profile.signOutConfirm.confirm'),
      t('common:actions.cancel'),
      true
    );
    if (!ok) return;
    setSigningOut(true);
    await signOut();
    router.replace('/auth/sign-in');
  };

  return (
    <Screen glow keyboard>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader eyebrow={roleLabel(role)} title={t('profile.title')} />

      <Card style={styles.identity}>
        <Avatar name={name} uri={profile?.photos?.[0]} size={64} verified={isGuard && profile?.kycStatus === 'approved'} />
        <View style={styles.identityText}>
          <AppText variant="title2" numberOfLines={3} style={displayName.length > 20 ? styles.identityLong : null}>
            {displayName}
          </AppText>
          {role === 'company' && profile?.companyName ? (
            <AppText variant="footnote" numberOfLines={1}>
              {name}
            </AppText>
          ) : null}
          <View style={styles.badges}>
            <Badge label={roleLabel(role)} tone="accent" />
            {isGuard ? <Badge label={kyc.label} tone={kyc.tone} icon={ShieldCheck} /> : null}
          </View>
        </View>
      </Card>

      {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} style={styles.notice} /> : null}

      {/* Idioma arriba del todo: es lo primero que busca quien no entiende la pantalla. */}
      <SectionTitle title={t('profile.sections.preferences')} />
      <ListGroup>
        <LanguageRow title={t('profile.language.title')} subtitle={t('profile.language.subtitle')} />
      </ListGroup>

      <SectionTitle title={t('profile.sections.account')} />
      {/* Dato debajo de la etiqueta (no a la derecha): ListRow limita el valor
          al 45 % del ancho y a 375 px cortaba correos y nombres de empresa. */}
      <ListGroup>
        <ListRow icon={Mail} title={t('profile.rows.email')} subtitle={profile?.email || '—'} />
        <ListRow icon={Phone} title={t('profile.rows.phone')} subtitle={profile?.phone || '—'} />
        {role === 'company' ? (
          <ListRow icon={Building2} title={t('profile.rows.company')} subtitle={profile?.companyName || '—'} />
        ) : null}
      </ListGroup>

      {isGuard && profile ? <ProtectorProfileSection guard={profile} /> : null}

      {isGuard ? (
        <>
          <SectionTitle title={t('profile.sections.verification')} />
          <ListGroup>
            <ListRow
              icon={ShieldCheck}
              title={t('profile.rows.myDocuments')}
              subtitle={
                profile?.kycStatus === 'approved'
                  ? t('profile.subtitles.kycApproved')
                  : profile?.kycStatus === 'rejected'
                  ? t('profile.subtitles.kycRejected')
                  : t('profile.subtitles.kycPending')
              }
              onPress={() => router.push('/kyc-documents')}
            />
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title={t('profile.sections.security')} />
      <ListGroup>
        <ListRow
          icon={KeyRound}
          title={t('profile.rows.resetPassword')}
          subtitle={profile?.email ? t('profile.subtitles.resetPassword', { email: profile.email }) : undefined}
          onPress={handleResetPassword}
          trailing={sendingReset ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined}
          showChevron={!sendingReset}
        />
      </ListGroup>

      <SectionTitle title={t('profile.sections.privacy')} />
      <ListGroup>
        <ListRow
          icon={SlidersHorizontal}
          title={t('profile.rows.privacyData')}
          subtitle={t('profile.subtitles.privacyData')}
          onPress={() => router.push('/privacy-settings')}
        />
        <ListRow icon={FileText} title={t('profile.rows.privacyPolicy')} onPress={() => router.push('/privacy-policy')} />
        <ListRow
          icon={Download}
          title={t('profile.rows.exportData')}
          subtitle={t('profile.subtitles.exportData')}
          onPress={handleExport}
          trailing={exporting ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined}
          showChevron={!exporting}
        />
      </ListGroup>

      <SectionTitle title={t('profile.sections.session')} />
      <ListGroup>
        <ListRow
          icon={LogOut}
          title={signingOut ? t('profile.rows.signingOut') : t('profile.rows.signOut')}
          destructive
          onPress={handleSignOut}
          showChevron={false}
        />
        <ListRow
          icon={Trash2}
          title={t('profile.rows.deleteAccount')}
          subtitle={t('profile.subtitles.deleteAccount')}
          destructive
          onPress={() => router.push('/privacy-settings')}
        />
      </ListGroup>

      <AppText variant="caption" color={Colors.textTertiary} align="center" style={styles.version}>
        Escolta Pro{version ? ` · ${t('profile.version', { version })}` : ''}
      </AppText>
    </Screen>
  );
}

// Fila de idioma con el mismo aspecto que ListRow, pero con el selector en su
// propia linea: la pastilla "English | Español" mide 216 px y a 375 px de ancho
// no cabe junto al titulo sin aplastarlo.
function LanguageRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.langRow}>
      <View style={styles.langHead}>
        <View style={styles.langIcon}>
          <Languages size={17} color={Colors.accent} strokeWidth={ICON_STROKE} />
        </View>
        <View style={styles.langText}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="footnote" numberOfLines={2}>
            {subtitle}
          </AppText>
        </View>
      </View>
      <LanguageToggle size="full" style={styles.langToggle} />
    </View>
  );
}

const LANGUAGE_OPTIONS: Language[] = ['es', 'en', 'fr', 'de'];

type GuardProfile = UserRecord & { bio?: string; languages?: Language[] };

// Lo que un escolta controla de su ficha publica. El listado de clientes solo
// muestra escoltas verificados, con availability === true (booleano) y una
// tarifa positiva; antes no habia pantalla para fijar nada de eso.
function ProtectorProfileSection({ guard }: { guard: GuardProfile }) {
  const { updateUser } = useAuth();
  const { t } = useTranslation('account');
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
      setAvailabilityError(t('protector.availabilityError'));
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
      setRateError(t('protector.rate.error'));
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
      setSaveResult({ tone: 'success', message: t('protector.saved') });
    } catch (error) {
      logger.error('[Profile] Failed to save protector profile', error);
      setSaveResult({ tone: 'error', message: t('protector.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const listedHint =
    guard.kycStatus !== 'approved'
      ? t('protector.hints.notVerified')
      : savedRate === null
      ? t('protector.hints.noRate')
      : available
      ? t('protector.hints.listed')
      : t('protector.hints.hidden');

  return (
    <>
      <SectionTitle title={t('protector.title')} />
      <ListGroup>
        <ListRow
          icon={CircleDot}
          title={t('protector.available')}
          subtitle={listedHint}
          showChevron={false}
          trailing={
            savingAvailability ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Switch
                value={available}
                onValueChange={toggleAvailability}
                trackColor={{ false: Colors.borderStrong, true: Colors.accentDark }}
                thumbColor={available ? Colors.accentLight : Colors.textSecondary}
                ios_backgroundColor={Colors.borderStrong}
                // En web el pulgar activo es verde azulado (#009688) si no se indica.
                {...WEB_SWITCH_ON}
                accessibilityLabel={t('protector.available')}
              />
            )
          }
        />
      </ListGroup>
      {availabilityError ? <Notice tone="error" message={availabilityError} style={styles.notice} /> : null}

      <Card style={styles.protectorCard}>
        <Input
          label={t('protector.rate.label')}
          placeholder={t('protector.rate.placeholder')}
          value={rate}
          onChangeText={(text) => {
            setRate(text);
            setSaveResult(null);
            if (rateError) setRateError(null);
          }}
          error={rateError}
          hint={savedRate !== null ? t('protector.rate.hintCurrent', { amount: formatMXN(savedRate) }) : t('protector.rate.hint')}
          keyboardType="decimal-pad"
          accessibilityLabel={t('protector.rate.a11y')}
        />
        <Input
          label={t('protector.bio.label')}
          placeholder={t('protector.bio.placeholder')}
          value={bio}
          onChangeText={(text) => {
            setBio(text);
            setSaveResult(null);
          }}
          multiline
          maxLength={400}
          accessibilityLabel={t('protector.bio.a11y')}
        />
        <View style={styles.langs}>
          <AppText variant="caption" color={Colors.textSecondary}>
            {t('protector.languages')}
          </AppText>
          <View style={styles.langChips}>
            {LANGUAGE_OPTIONS.map((lang) => (
              <Chip key={lang} label={LANGUAGE_LABEL[lang]} selected={languages.includes(lang)} onPress={() => toggleLanguage(lang)} />
            ))}
          </View>
        </View>
        {saveResult ? <Notice tone={saveResult.tone} message={saveResult.message} /> : null}
        <Button title={t('protector.save')} variant="secondary" onPress={save} loading={saving} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  // Mismas medidas que ListRow (components/ui/Data.tsx) para que la fila case con el resto.
  langRow: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    gap: Space.md,
  },
  langHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 36,
  },
  langIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langText: {
    flex: 1,
    gap: 2,
  },
  // Alineado con el texto, no con el icono (34 + 12 de separacion).
  langToggle: {
    marginLeft: 34 + Space.md,
  },
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
  // Nombres largos ("Sentinela Protección Ejecutiva") se cortaban a 2 lineas.
  identityLong: {
    fontSize: 18,
    lineHeight: 23,
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
