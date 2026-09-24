import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AppState, Platform } from "react-native";
import { User, UserRole } from "@/types";
import { auth as getAuthInstance, db as getDbInstance, realtimeDb as getRealtimeDb } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { ref, set } from "firebase/database";
import { pushNotificationService } from "@/services/pushNotificationService";
import { rateLimitService } from "@/services/rateLimitService";
import { monitoringService } from "@/services/monitoringService";
import { validatePasswordStrength } from "@/utils/passwordValidation";
import { logger } from "@/utils/logger";
import i18n, { applyProfileLanguage, currentLanguage } from "@/i18n";

// Roles que la app sabe mostrar. Un documento con otro valor (p. ej. el
// 'bodyguard' viejo del sembrador) provocaba un bucle de redirecciones
// infinito entre index, tabs y sign-in.
const VALID_ROLES: readonly UserRole[] = ["client", "guard", "company", "admin"];
// Roles que cualquiera puede elegir al registrarse. 'admin' nunca: antes el
// formulario lo ofrecia y las reglas no lo impedian.
const SELF_SERVICE_ROLES: readonly UserRole[] = ["client", "guard", "company"];

// Cierre de sesion por inactividad real (toques/teclado), no 30 minutos
// despues del acceso sin importar lo que el usuario estuviera haciendo.
// Los escoltas quedan exentos: en servicio publican su ubicacion con el
// telefono en el bolsillo, y cerrarles la sesion cortaria el seguimiento.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 60 * 1000;

const allowUnverified = () => __DEV__ && (process.env.EXPO_PUBLIC_ALLOW_UNVERIFIED_LOGIN ?? "") === "1";

export type AuthResult = { success: boolean; error?: string };

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Motivo por el que no hay sesion (perfil ilegible, rol invalido,
  // suspension, inactividad). La pantalla de acceso lo muestra.
  const [authError, setAuthError] = useState<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  // Mientras un flujo maneja la sesion por su cuenta (registro, reenvio de
  // verificacion), el listener no debe cerrar la sesion ni crear documentos.
  // Sin esto el registro fallaba siempre en produccion: el listener cerraba la
  // sesion del usuario recien creado (sin verificar) antes de que se guardara
  // su perfil, las reglas rechazaban la escritura, y el rol elegido se perdia.
  const authFlowRef = useRef(false);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const loadProfile = useCallback(async (uid: string, email: string | null): Promise<Omit<User, "id">> => {
    const userRef = doc(getDbInstance(), "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) return snap.data() as Omit<User, "id">;

    // Cuentas antiguas sin documento: se crea uno minimo de cliente.
    logger.warn("[Auth] User document not found. Creating minimal client profile");
    const now = new Date().toISOString();
    const minimal = {
      email: email ?? "",
      role: "client" as const,
      firstName: "",
      lastName: "",
      phone: "",
      language: "en" as const,
      kycStatus: "pending" as const,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      // Las reglas exigen false al crear: el estado real vive en Firebase Auth
      emailVerified: false,
    };
    await setDoc(userRef, minimal);
    return minimal;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuthInstance(), async (firebaseUser) => {
      if (authFlowRef.current) return;

      if (!firebaseUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (!firebaseUser.emailVerified && !allowUnverified()) {
        await firebaseSignOut(getAuthInstance()).catch(() => {});
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const profile = await loadProfile(firebaseUser.uid, firebaseUser.email);

        if (!VALID_ROLES.includes(profile.role)) {
          logger.error("[Auth] Invalid role on profile", { role: profile.role });
          setAuthError(i18n.t("auth:errors.profileMisconfigured"));
          await firebaseSignOut(getAuthInstance()).catch(() => {});
          setUser(null);
        } else if ((profile as { suspended?: boolean }).suspended === true) {
          setAuthError(i18n.t("auth:errors.suspended"));
          await firebaseSignOut(getAuthInstance()).catch(() => {});
          setUser(null);
        } else {
          setAuthError(null);
          markActivity();
          setUser({ id: firebaseUser.uid, ...profile });
          applyProfileLanguage(profile.language);
          // El registro de avisos push va en segundo plano: antes el
          // arranque esperaba el permiso, dos peticiones de token y dos
          // escrituras antes de mostrar nada. Y ya registra el rol real
          // (estaba fijo en 'client').
          pushNotificationService
            .registerDevice(firebaseUser.uid, profile.role)
            .catch((e) => logger.warn("[Auth] Push registration failed", { error: e }));
        }
      } catch (error: any) {
        logger.error("[Auth] Error loading user profile", { error: error?.message ?? error });
        setAuthError(
          error?.code === "permission-denied"
            ? i18n.t("auth:errors.profileDenied")
            : i18n.t("auth:errors.profileLoadFailed")
        );
        // Sin cerrar sesion aqui el boton de acceso giraba para siempre:
        // Firebase no vuelve a disparar el listener para el mismo usuario.
        await firebaseSignOut(getAuthInstance()).catch(() => {});
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [loadProfile, markActivity]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult & { emailNotVerified?: boolean }> => {
      try {
        const rateLimitCheck = await rateLimitService.checkRateLimit("login", email);
        if (!rateLimitCheck.allowed) {
          return { success: false, error: rateLimitService.getRateLimitError("login", rateLimitCheck.blockedUntil!) };
        }
        setAuthError(null);
        const credential = await signInWithEmailAndPassword(getAuthInstance(), email, password);
        if (!credential.user.emailVerified && !allowUnverified()) {
          await firebaseSignOut(getAuthInstance()).catch(() => {});
          return { success: false, error: i18n.t("auth:errors.verifyFirst"), emailNotVerified: true };
        }
        await rateLimitService.resetRateLimit("login", email);
        monitoringService.trackEvent("user_login", { userId: credential.user.uid }, credential.user.uid).catch(() => {});
        return { success: true };
      } catch (error: any) {
        logger.error("[Auth] Sign in error", { code: error?.code });
        let message = i18n.t("auth:errors.signInFailed");
        if (error?.code === "auth/user-not-found" || error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password") {
          message = i18n.t("auth:errors.wrongCredentials");
        } else if (error?.code === "auth/invalid-email") {
          message = i18n.t("auth:validation.emailInvalid");
        } else if (error?.code === "auth/too-many-requests") {
          message = i18n.t("auth:errors.tooManyAttempts");
        } else if (error?.code === "auth/network-request-failed") {
          message = i18n.t("auth:errors.network");
        }
        return { success: false, error: message };
      }
    },
    []
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      phone: string,
      role: UserRole,
      // Consentimientos del registro (LFPDPPP). Antes se pedian y se tiraban.
      consents?: { terms: boolean; privacy: boolean; dataProcessing: boolean; marketing: boolean }
    ): Promise<AuthResult & { needsVerification?: boolean }> => {
      if (!SELF_SERVICE_ROLES.includes(role)) {
        return { success: false, error: i18n.t("auth:errors.roleUnavailable") };
      }
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return { success: false, error: i18n.t("auth:errors.weakPassword", { feedback: passwordValidation.feedback.join(", ") }) };
      }

      authFlowRef.current = true;
      try {
        const credential = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
        const uid = credential.user.uid;
        const now = new Date().toISOString();
        // El perfil se escribe PRIMERO, con la sesion todavia abierta.
        await setDoc(doc(getDbInstance(), "users", uid), {
          email,
          role,
          firstName,
          lastName,
          phone,
          language: currentLanguage(),
          kycStatus: "pending",
          createdAt: now,
          updatedAt: now,
          isActive: true,
          emailVerified: false,
          ...(consents
            ? {
                consents: {
                  terms: consents.terms ? now : null,
                  privacy: consents.privacy ? now : null,
                  dataProcessing: consents.dataProcessing ? now : null,
                  marketing: consents.marketing,
                  recordedAt: now,
                },
              }
            : {}),
        });
        // Espejo del rol en Realtime Database: lo usan sus reglas para
        // reconocer empresas. Las reglas solo lo dejan crear una vez.
        await set(ref(getRealtimeDb(), `users/${uid}`), { role }).catch((e) =>
          logger.warn("[Auth] Role mirror write failed", { error: e?.message })
        );
        await sendEmailVerification(credential.user);
        monitoringService.trackEvent("user_signup", { role, userId: uid }, uid).catch(() => {});
        return { success: true, needsVerification: true };
      } catch (error: any) {
        logger.error("[Auth] Sign up error", { code: error?.code, message: error?.message });
        let message = i18n.t("auth:errors.signUpFailed");
        if (error?.code === "auth/email-already-in-use") message = i18n.t("auth:errors.emailInUse");
        else if (error?.code === "auth/invalid-email") message = i18n.t("auth:validation.emailInvalid");
        else if (error?.code === "auth/weak-password") message = i18n.t("auth:errors.chooseStronger");
        else if (error?.code === "auth/network-request-failed") message = i18n.t("auth:errors.network");
        return { success: false, error: message };
      } finally {
        await firebaseSignOut(getAuthInstance()).catch(() => {});
        authFlowRef.current = false;
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      const uid = getAuthInstance().currentUser?.uid;
      if (uid) {
        // Que este telefono deje de recibir los avisos de esta cuenta.
        await pushNotificationService.unregisterDevice(uid).catch(() => {});
      }
      await firebaseSignOut(getAuthInstance());
    } catch (error) {
      logger.error("[Auth] Sign out error", { error });
    }
  }, []);

  // Lanza si falla: antes tragaba el error y, p. ej., un documento KYC subido
  // parecia guardado aunque el perfil nunca se actualizara.
  const updateUser = useCallback(
    async (updates: Partial<User>) => {
      if (!user) throw new Error("Not signed in");
      const { id: _id, ...updateData } = updates as Partial<User> & { id?: string };
      await updateDoc(doc(getDbInstance(), "users", user.id), { ...updateData, updatedAt: new Date().toISOString() });
      setUser((prev) => (prev ? { ...prev, ...updateData } : prev));
    },
    [user]
  );

  // Reenvio de verificacion. Necesita las credenciales: la cuenta sin
  // verificar ya no tiene sesion abierta (antes fallaba siempre por eso).
  const resendVerificationEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    authFlowRef.current = true;
    try {
      const credential = await signInWithEmailAndPassword(getAuthInstance(), email, password);
      if (credential.user.emailVerified) {
        return { success: false, error: i18n.t("auth:errors.alreadyVerified") };
      }
      await sendEmailVerification(credential.user);
      return { success: true };
    } catch (error: any) {
      logger.error("[Auth] Resend verification error", { code: error?.code });
      if (error?.code === "auth/too-many-requests") {
        return { success: false, error: i18n.t("auth:errors.resendTooSoon") };
      }
      return { success: false, error: i18n.t("auth:errors.resendFailed") };
    } finally {
      await firebaseSignOut(getAuthInstance()).catch(() => {});
      authFlowRef.current = false;
    }
  }, []);

  // Restablecer contrasena. Responde igual exista o no la cuenta, para no
  // revelar que correos estan registrados.
  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const trimmed = email.trim();
    if (!trimmed) return { success: false, error: i18n.t("auth:errors.emailFirst") };
    try {
      await sendPasswordResetEmail(getAuthInstance(), trimmed);
      return { success: true };
    } catch (error: any) {
      if (error?.code === "auth/invalid-email") return { success: false, error: i18n.t("auth:validation.emailInvalid") };
      if (error?.code === "auth/user-not-found") return { success: true };
      if (error?.code === "auth/network-request-failed") return { success: false, error: i18n.t("auth:errors.network") };
      logger.error("[Auth] Password reset error", { code: error?.code });
      return { success: false, error: i18n.t("auth:errors.resetFailed") };
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Inactividad: se mide desde el ultimo toque/tecla (ver ActivityBoundary en
  // app/_layout.tsx) y al volver del segundo plano.
  useEffect(() => {
    if (!user || user.role === "guard") return;

    const expireIfIdle = () => {
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        logger.log("[Auth] Signing out after inactivity");
        setAuthError(i18n.t("auth:errors.idleSignOut"));
        signOut();
      }
    };

    const interval = setInterval(expireIfIdle, IDLE_CHECK_INTERVAL_MS);
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") expireIfIdle();
    });

    let removeWebListeners: (() => void) | undefined;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onActivity = () => markActivity();
      window.addEventListener("pointerdown", onActivity, { passive: true });
      window.addEventListener("keydown", onActivity, { passive: true });
      removeWebListeners = () => {
        window.removeEventListener("pointerdown", onActivity);
        window.removeEventListener("keydown", onActivity);
      };
    }

    return () => {
      clearInterval(interval);
      appStateSub.remove();
      removeWebListeners?.();
    };
  }, [user, signOut, markActivity]);

  return useMemo(
    () => ({
      user,
      isLoading,
      authError,
      clearAuthError,
      signIn,
      signUp,
      signOut,
      updateUser,
      resendVerificationEmail,
      resetPassword,
      markActivity,
      // Compatibilidad con el nombre anterior
      resetSessionTimeout: markActivity,
    }),
    [user, isLoading, authError, clearAuthError, signIn, signUp, signOut, updateUser, resendVerificationEmail, resetPassword, markActivity]
  );
});
