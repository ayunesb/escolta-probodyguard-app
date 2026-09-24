import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { DEV_ACCOUNTS, DEV_PASSWORD, DevRole } from '@/constants/devAccounts';
import Colors from '@/constants/colors';
import { Fonts, ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, BrandMark, Button, Card, Input, PressableScale, Screen } from '@/components/ui';

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
  return (
    <Card style={styles.testPanel}>
      <View style={styles.testHeader}>
        <FlaskConical size={15} color={Colors.gold} strokeWidth={ICON_STROKE} />
        <AppText variant="overline" color={Colors.gold}>
          Test mode · local emulator
        </AppText>
      </View>
      <AppText variant="footnote" style={styles.testIntro}>
        Enter as any role with seeded data. These accounts only exist on this machine.
      </AppText>
      <View style={styles.testGrid}>
        {(Object.keys(DEV_ACCOUNTS) as DevRole[]).map((role) => {
          const acct = DEV_ACCOUNTS[role];
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
              accessibilityLabel={`Sign in as test ${acct.label}`}
              hoverStyle={{ borderColor: Colors.goldLine, backgroundColor: Colors.surfaceLight }}
              style={[styles.roleTile, busy ? styles.roleTileBusy : null, busyRole && !busy ? styles.roleTileDim : null]}
            >
              <View style={styles.roleIcon}>
                <Icon size={17} color={Colors.gold} strokeWidth={ICON_STROKE} />
              </View>
              <AppText variant="headline">{busy ? 'Signing in…' : acct.label}</AppText>
              <AppText variant="caption" color={Colors.textTertiary} numberOfLines={2}>
                {acct.description}
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
    if (!trimmedEmail) nextErrors.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) nextErrors.email = "That email address isn't valid.";
    if (!password) nextErrors.password = 'Enter your password.';
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    resetMessages();
    setShowResendVerification(false);
    setIsLoading(true);
    const result = await signIn(trimmedEmail, password);
    if (result.success) return; // sigue girando hasta que llegue el usuario
    setError(result.error || "We couldn't sign you in.");
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
      setSuccess(`Verification email sent to ${email.trim()}. Check your inbox, then sign in.`);
    } else {
      setError(result.error || "We couldn't resend the verification email.");
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();
    if (!email.trim()) {
      setFieldErrors({ email: 'Enter your email, then tap "Forgot password" again.' });
      return;
    }
    setFieldErrors({});
    const result = await resetPassword(email);
    if (result.success) {
      setSuccess(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    } else {
      setError(result.error || "We couldn't send the reset email.");
    }
  };

  const handleBiometricSignIn = async () => {
    resetMessages();
    setIsLoading(true);
    try {
      const authenticated = await biometricService.authenticate('Sign in to Escolta Pro');
      const credentials = authenticated ? await biometricService.getStoredCredentials() : null;
      if (!credentials) {
        setError(authenticated ? 'No saved sign-in found on this device.' : 'Biometric check failed.');
        setIsLoading(false);
        return;
      }
      const result = await signIn(credentials.email, credentials.encryptedPassword);
      if (!result.success) {
        setError(result.error || "We couldn't sign you in.");
        setIsLoading(false);
      }
    } catch {
      setError('Biometric sign-in failed.');
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (role: DevRole) => {
    resetMessages();
    setBusyRole(role);
    const result = await signIn(DEV_ACCOUNTS[role].email, DEV_PASSWORD);
    if (!result.success) {
      setError(`${result.error ?? 'Sign-in failed.'} Is the emulator running and seeded? (npm run dev:emulated)`);
      setBusyRole(null);
    }
  };

  const message = error || authError;

  return (
    <Screen glow keyboard padBottom contentStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.brandRow}>
        <BrandMark size={40} />
        <View>
          <AppText style={styles.brandName}>ESCOLTA PRO</AppText>
          <AppText variant="overline" color={Colors.gold} style={styles.brandTag}>
            Executive protection
          </AppText>
        </View>
      </View>

      <View style={styles.hero}>
        <AppText variant="display" accessibilityRole="header">
          Discreet protection,{'\n'}
          <AppText variant="display" style={styles.heroItalic}>
            on your schedule.
          </AppText>
        </AppText>
        <AppText variant="callout" style={styles.heroSub}>
          Vetted close-protection professionals, booked in minutes and tracked in real time.
        </AppText>
      </View>

      {USING_EMULATORS ? <TestModePanel busyRole={busyRole} onPick={handleQuickLogin} /> : null}

      <View style={styles.form}>
        <Input
          label="Email"
          icon={Mail}
          value={email}
          onChangeText={(text) => {
            setEmail(text.trim());
            if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
          }}
          placeholder="you@company.com"
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
            label="Password"
            icon={Lock}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
            }}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            error={fieldErrors.password}
          />
          <PressableScale onPress={handleForgotPassword} scaleTo={0.97} style={styles.forgot} accessibilityRole="button" accessibilityLabel="Forgot password">
            <AppText variant="footnote" color={Colors.gold}>
              Forgot password?
            </AppText>
          </PressableScale>
        </View>

        {message ? <Notice tone="error" message={message} /> : null}
        {success ? <Notice tone="success" message={success} /> : null}

        {showResendVerification ? (
          <Button title="Resend verification email" variant="outline" icon={Mail} onPress={handleResendVerification} disabled={isLoading} />
        ) : null}

        <Button title="Sign in" size="lg" onPress={handleSignIn} loading={isLoading} disabled={!!busyRole} />

        {biometricReady ? (
          <Button title="Sign in with biometrics" variant="secondary" icon={Fingerprint} onPress={handleBiometricSignIn} disabled={isLoading} />
        ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <AppText variant="caption" color={Colors.textTertiary}>
            New to Escolta Pro?
          </AppText>
          <View style={styles.dividerLine} />
        </View>
        <Button title="Create an account" variant="secondary" onPress={() => router.push('/auth/sign-up')} />
      </View>

      {__DEV__ && !!process.env.EXPO_PUBLIC_DEMO_EMAIL && !USING_EMULATORS ? (
        <AppText variant="caption" color={Colors.textTertiary} align="center" style={styles.devNote}>
          Dev build: account prefilled from .env ({process.env.EXPO_PUBLIC_DEMO_EMAIL})
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    paddingTop: Space.xxxl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginBottom: Space.huge,
  },
  brandName: {
    fontFamily: Fonts.displayHeavy,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: 3.2,
    color: Colors.textPrimary,
  },
  brandTag: {
    fontSize: 8.5,
    letterSpacing: 2.6,
    marginTop: 3,
  },
  hero: {
    marginBottom: Space.xxxl,
  },
  heroItalic: {
    fontFamily: Fonts.displayLight,
    color: Colors.goldLight,
  },
  heroSub: {
    marginTop: Space.lg,
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
  footer: {
    marginTop: Space.xxxl,
    gap: Space.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderStrong,
  },
  devNote: {
    marginTop: Space.xl,
  },
  testPanel: {
    marginBottom: Space.xxxl,
    borderColor: Colors.goldLine,
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
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleTileBusy: {
    borderColor: Colors.gold,
  },
  roleTileDim: {
    opacity: 0.45,
  },
  roleIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
});
