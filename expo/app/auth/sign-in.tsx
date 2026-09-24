import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
  Fingerprint,
  Lock,
  Mail,
  Shield,
  BriefcaseBusiness,
  Building2,
  ShieldCheck,
  FlaskConical,
  CircleAlert,
  CircleCheck,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { biometricService } from '@/services/biometricService';
import { USING_EMULATORS } from '@/lib/firebase';
import { PUBLIC_DEMO } from '@/constants/demo';
import { DEV_ACCOUNTS, DEV_PASSWORD, DevRole } from '@/constants/devAccounts';
import Colors from '@/constants/colors';
import { Fonts, ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, BackgroundVideo, BrandMark, Button, Card, Input, PressableScale, Scrim } from '@/components/ui';
import { BrandVideo } from '@/constants/brandMedia';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/LanguageToggle';

const ROLE_ICONS: Record<DevRole, LucideIcon> = {
  client: Shield,
  guard: BriefcaseBusiness,
  company: Building2,
  admin: ShieldCheck,
};

function Notice({ tone, message }: { tone: 'error' | 'success'; message: string }) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  const color = tone === 'error' ? Colors.error : Colors.success;
  return (
    <View
      style={[styles.notice, { backgroundColor: tone === 'error' ? Colors.errorSoft : Colors.successSoft }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon size={17} color={color} strokeWidth={ICON_STROKE} />
      <AppText variant="footnote" color={tone === 'error' ? Colors.textPrimary : Colors.textPrimary} style={styles.noticeText}>
        {message}
      </AppText>
    </View>
  );
}

// Acceso rapido por rol. Solo existe con el emulador local (ver
// scripts/emulator/README.md); en produccion __DEV__ es falso y esto no se monta.
function TestModePanel({ busyRole, onPick }: { busyRole: DevRole | null; onPick: (role: DevRole) => void }) {
  const { t } = useTranslation('auth');
  return (
    <Card style={styles.testPanel}>
      <View style={styles.testHeader}>
        <FlaskConical size={15} color={Colors.accent} strokeWidth={ICON_STROKE} />
        <AppText variant="overline" color={Colors.accent}>
          {t(PUBLIC_DEMO ? 'publicDemo.title' : 'testMode.title')}
        </AppText>
      </View>
      <AppText variant="footnote" style={styles.testIntro}>
        {t(PUBLIC_DEMO ? 'publicDemo.intro' : 'testMode.intro')}
      </AppText>
      <View style={styles.testGrid}>
        {(Object.keys(DEV_ACCOUNTS) as DevRole[]).map((role) => {
          const label = t(`testMode.roles.${role}.label`);
          const Icon = ROLE_ICONS[role];
          const busy = busyRole === role;
          return (
            <PressableScale
              key={role}
              onPress={() => onPick(role)}
              disabled={!!busyRole}
              scaleTo={0.96}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={t(PUBLIC_DEMO ? 'publicDemo.a11y' : 'testMode.a11y', { role: label })}
              hoverStyle={{ borderColor: Colors.accentLine, backgroundColor: Colors.surfaceLight }}
              style={[styles.roleTile, busy ? styles.roleTileBusy : null, busyRole && !busy ? styles.roleTileDim : null]}
            >
              <View style={styles.roleIcon}>
                <Icon size={17} color={Colors.accent} strokeWidth={ICON_STROKE} />
              </View>
              <AppText variant="headline">{busy ? t('testMode.signingIn') : label}</AppText>
              <AppText variant="caption" color={Colors.textTertiary} numberOfLines={2}>
                {t(`testMode.roles.${role}.description`)}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </Card>
  );
}

export default function SignInScreen() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const { signIn, resendVerificationEmail, resetPassword, user, authError, clearAuthError } = useAuth();
  // Precarga solo en desarrollo, y solo si tu .env local las define. Antes
  // estaban escritas aqui, y este repositorio es publico.
  const [email, setEmail] = useState(__DEV__ ? (process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '') : '');
  const [password, setPassword] = useState(__DEV__ ? (process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '') : '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [busyRole, setBusyRole] = useState<DevRole | null>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWide = width >= 900;
  const mediaHeight = Math.max(420, Math.round(height * 0.58));

  // Quien enruta despues del acceso: en cuanto AuthContext tiene usuario,
  // esta pantalla manda a "/" e index.tsx hace el reparto por rol.
  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  // Si el perfil no se pudo cargar (o la cuenta esta suspendida), AuthContext
  // lo reporta aqui y el boton deja de girar.
  useEffect(() => {
    if (authError) {
      setIsLoading(false);
      setBusyRole(null);
    }
  }, [authError]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([biometricService.isAvailable(), biometricService.isBiometricEnabled()])
      .then(([available, enabled]) => {
        if (!cancelled) setBiometricReady(available && enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const resetMessages = () => {
    setError('');
    setSuccess('');
    clearAuthError();
  };

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    const nextErrors: typeof fieldErrors = {};
    if (!trimmedEmail) nextErrors.email = t('validation.emailRequired');
    else if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) nextErrors.email = t('validation.emailInvalid');
    if (!password) nextErrors.password = t('validation.passwordRequired');
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    resetMessages();
    setShowResendVerification(false);
    setIsLoading(true);
    const result = await signIn(trimmedEmail, password);
    if (result.success) return; // sigue girando hasta que llegue el usuario
    setError(result.error || t('errors.signInFailedShort'));
    setShowResendVerification(!!result.emailNotVerified);
    setIsLoading(false);
  };

  const handleResendVerification = async () => {
    resetMessages();
    setIsLoading(true);
    const result = await resendVerificationEmail(email.trim(), password);
    setIsLoading(false);
    if (result.success) {
      setShowResendVerification(false);
      setSuccess(t('messages.verificationSent', { email: email.trim() }));
    } else {
      setError(result.error || t('errors.resendFailed'));
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();
    if (!email.trim()) {
      setFieldErrors({ email: t('validation.forgotNeedsEmail') });
      return;
    }
    setFieldErrors({});
    const result = await resetPassword(email);
    if (result.success) {
      setSuccess(t('messages.resetSent', { email: email.trim() }));
    } else {
      setError(result.error || t('errors.resetFailedShort'));
    }
  };

  const handleBiometricSignIn = async () => {
    resetMessages();
    setIsLoading(true);
    try {
      const authenticated = await biometricService.authenticate(t('signIn.biometricPrompt'));
      const credentials = authenticated ? await biometricService.getStoredCredentials() : null;
      if (!credentials) {
        setError(authenticated ? t('messages.noSavedSignIn') : t('messages.biometricFailed'));
        setIsLoading(false);
        return;
      }
      const result = await signIn(credentials.email, credentials.encryptedPassword);
      if (!result.success) {
        setError(result.error || t('errors.signInFailedShort'));
        setIsLoading(false);
      }
    } catch {
      setError(t('messages.biometricSignInFailed'));
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (role: DevRole) => {
    resetMessages();
    setBusyRole(role);
    const result = await signIn(DEV_ACCOUNTS[role].email, DEV_PASSWORD);
    if (!result.success) {
      setError(t('testMode.emulatorHint', { error: result.error ?? t('testMode.failed') }));
      setBusyRole(null);
    }
  };

  const message = error || authError;

  const form = PUBLIC_DEMO ? (
    <View style={styles.form}>
      <TestModePanel busyRole={busyRole} onPick={handleQuickLogin} />
      {message ? <Notice tone="error" message={message} /> : null}
    </View>
  ) : (
    <View style={styles.form}>
      <Input
        label={t('signIn.email')}
        icon={Mail}
        value={email}
        onChangeText={(text) => {
          setEmail(text.trim());
          if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
        }}
        placeholder={t('signIn.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        error={fieldErrors.email}
      />
      <View>
        <Input
          label={t('signIn.password')}
          icon={Lock}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
          }}
          placeholder={t('signIn.passwordPlaceholder')}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleSignIn}
          error={fieldErrors.password}
        />
        <PressableScale onPress={handleForgotPassword} scaleTo={0.97} style={styles.forgot} accessibilityRole="button" accessibilityLabel={t('signIn.forgotA11y')}>
          <AppText variant="footnote" color={Colors.accentLight}>
            {t('signIn.forgot')}
          </AppText>
        </PressableScale>
      </View>

      {message ? <Notice tone="error" message={message} /> : null}
      {success ? <Notice tone="success" message={success} /> : null}

      {showResendVerification ? (
        <Button title={t('signIn.resendVerification')} variant="outline" icon={Mail} onPress={handleResendVerification} disabled={isLoading} />
      ) : null}

      <Button title={t('signIn.submit')} size="lg" onPress={handleSignIn} loading={isLoading} disabled={!!busyRole} />

      {biometricReady ? (
        <Button title={t('signIn.biometric')} variant="secondary" icon={Fingerprint} onPress={handleBiometricSignIn} disabled={isLoading} />
      ) : null}

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <AppText variant="caption" color={Colors.textTertiary}>
          {t('signIn.newHere')}
        </AppText>
        <View style={styles.dividerLine} />
      </View>
      <Button title={t('signIn.createAccount')} variant="secondary" onPress={() => router.push('/auth/sign-up')} />

      {USING_EMULATORS ? <TestModePanel busyRole={busyRole} onPick={handleQuickLogin} /> : null}

      {__DEV__ && !!process.env.EXPO_PUBLIC_DEMO_EMAIL && !USING_EMULATORS ? (
        <AppText variant="caption" color={Colors.textTertiary} align="center">
          {t('signIn.devPrefilled', { email: process.env.EXPO_PUBLIC_DEMO_EMAIL })}
        </AppText>
      ) : null}
    </View>
  );

  const brand = (
    <View style={styles.brandRow}>
      <BrandMark size={34} color={Colors.textPrimary} />
      <View style={styles.brandText}>
        <AppText style={styles.brandName}>ESCOLTA PRO</AppText>
        <AppText variant="overline" color={Colors.accentLight} style={styles.brandTag}>
          {t('brandTag')}
        </AppText>
      </View>
      <LanguageToggle />
    </View>
  );

  const headline = (
    <View>
      <AppText variant="display" color={Colors.white} accessibilityRole="header">
        {t('hero.line1')}{'\n'}
        <AppText variant="display" style={styles.heroAccent}>
          {t('hero.line2')}
        </AppText>
      </AppText>
      <AppText variant="callout" color={Colors.textSecondary} style={styles.heroSub}>
        {t('hero.sub')}
      </AppText>
    </View>
  );

  // Escritorio (web ancho): video a la izquierda a toda altura, formulario a
  // la derecha. Telefono: video arriba y el formulario sube en una hoja de vidrio.
  if (isWide) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.wideRow}>
          <View style={styles.wideMedia}>
            <BackgroundVideo source={BrandVideo.loginLoop} poster={BrandVideo.loginPoster} />
            <Scrim from="top" strength={0.95} start={0.3} />
            <View style={[styles.wideMediaInner, { paddingTop: insets.top + Space.xxxl }]}>
              {brand}
              {headline}
            </View>
          </View>
          <ScrollView style={styles.wideFormCol} contentContainerStyle={styles.wideFormContent} keyboardShouldPersistTaps="handled">
            <AppText variant="title1" style={styles.formTitle}>
              {t('signIn.welcome')}
            </AppText>
            {form}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
        <View style={[styles.media, { height: mediaHeight }]}>
          <BackgroundVideo source={BrandVideo.loginLoop} poster={BrandVideo.loginPoster} />
          <Scrim from="top" strength={1} start={0.25} />
          <Scrim from="bottom" strength={0.55} start={0.75} />
          <View style={[styles.mediaTop, { paddingTop: insets.top + Space.lg }]}>{brand}</View>
          <View style={styles.mediaBottom}>{headline}</View>
        </View>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Space.xxxl }]}>
          <View style={styles.sheetInner}>{form}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
  },
  media: {
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  mediaTop: {
    paddingHorizontal: Space.gutter,
  },
  mediaBottom: {
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.huge,
  },
  sheet: {
    flexGrow: 1,
    marginTop: -Space.xxxl,
    paddingTop: Space.xxl,
    paddingHorizontal: Space.gutter,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    backgroundColor: 'rgba(10, 16, 30, 0.92)',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.glassBorder,
  },
  sheetInner: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  brandText: {
    flex: 1,
  },
  brandName: {
    fontFamily: Fonts.displayHeavy,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 3,
    color: Colors.textPrimary,
  },
  brandTag: {
    fontSize: 8,
    letterSpacing: 2.4,
    marginTop: 3,
  },
  heroAccent: {
    fontFamily: Fonts.displayLight,
    color: Colors.accentLight,
  },
  heroSub: {
    marginTop: Space.md,
    maxWidth: 340,
  },
  form: {
    gap: Space.lg,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: Space.sm,
    paddingVertical: Space.xs,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: Radius.sm,
  },
  noticeText: {
    flex: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.glassBorder,
  },
  // Escritorio
  wideRow: {
    flex: 1,
    flexDirection: 'row',
  },
  wideMedia: {
    flex: 1.15,
    overflow: 'hidden',
  },
  wideMediaInner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: Space.huge,
  },
  wideFormCol: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: Colors.glassBorder,
  },
  wideFormContent: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingVertical: Space.huge,
    paddingHorizontal: Space.xxl,
  },
  formTitle: {
    marginBottom: Space.xl,
  },
  testPanel: {
    marginTop: Space.lg,
    borderColor: Colors.accentLine,
    borderStyle: 'dashed',
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  testIntro: {
    marginTop: Space.xs,
    marginBottom: Space.md,
  },
  testGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  roleTile: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: 3,
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  roleTileBusy: {
    borderColor: Colors.accent,
  },
  roleTileDim: {
    opacity: 0.45,
  },
  roleIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
});
