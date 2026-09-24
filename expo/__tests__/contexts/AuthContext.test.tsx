/**
 * Auth Flow Unit Tests
 * Tests for sign-in, sign-up, email verification, and session management
 */

// Mock logger before any imports that might use Firebase
jest.mock('../../utils/logger', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Firebase modules before importing AuthContext
jest.mock('firebase/auth');
jest.mock('firebase/firestore');
jest.mock('firebase/database', () => ({
  ref: jest.fn(() => ({})),
  set: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/firebase', () => ({
  auth: jest.fn(() => ({ currentUser: null })),
  db: jest.fn(() => ({})),
  realtimeDb: jest.fn(() => ({})),
}));
jest.mock('@/services/rateLimitService');
jest.mock('@/services/monitoringService');
jest.mock('@/services/notificationService', () => ({
  registerForPushNotificationsAsync: jest.fn().mockResolvedValue('mock-expo-token'),
}));
jest.mock('@/services/pushNotificationService', () => ({
  pushNotificationService: {
    registerDevice: jest.fn().mockResolvedValue(undefined),
    unregisterDevice: jest.fn().mockResolvedValue(undefined),
  },
}));

import { renderHook, act } from '@testing-library/react-native';
import { useAuth, AuthProvider } from '@/contexts/AuthContext';
import * as firebaseAuth from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import { rateLimitService } from '@/services/rateLimitService';
import { monitoringService } from '@/services/monitoringService';
import * as firebaseLib from '@/lib/firebase';
import React from 'react';

describe('AuthContext - Sign In Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock rate limiting - allow by default
    (rateLimitService.checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      attemptsRemaining: 5,
    });
    
    (rateLimitService.resetRateLimit as jest.Mock).mockResolvedValue(undefined);
    (monitoringService.trackEvent as jest.Mock).mockResolvedValue(undefined);
    (monitoringService.reportError as jest.Mock).mockResolvedValue(undefined);
  });

  it('should successfully sign in with valid credentials', async () => {
    const mockUser = {
      uid: 'test-user-123',
      email: 'test@example.com',
      emailVerified: true,
    };

    const mockUserData = {
      email: 'test@example.com',
      role: 'client',
      firstName: 'Test',
      lastName: 'User',
      phone: '+1234567890',
      language: 'en',
      kycStatus: 'approved',
      createdAt: '2024-01-01T00:00:00Z',
      isActive: true,
      emailVerified: true,
      updatedAt: '2024-01-01T00:00:00Z',
    };

    (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: mockUser,
    });

    (firestore.getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => mockUserData,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signIn('test@example.com', 'password123');
    });

    expect(signInResult).toEqual({ success: true });
    expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'password123'
    );
    expect(rateLimitService.resetRateLimit).toHaveBeenCalledWith('login', 'test@example.com');
    expect(monitoringService.trackEvent).toHaveBeenCalledWith(
      'user_login',
      expect.objectContaining({ userId: 'test-user-123' }),
      mockUser.uid
    );
  });

  it('should reject sign-in with unverified email when ALLOW_UNVERIFIED_LOGIN is disabled', async () => {
    const originalEnv = process.env.EXPO_PUBLIC_ALLOW_UNVERIFIED_LOGIN;
    process.env.EXPO_PUBLIC_ALLOW_UNVERIFIED_LOGIN = '0';

    const mockUser = {
      uid: 'test-user-123',
      email: 'test@example.com',
      emailVerified: false,
    };

    (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: mockUser,
    });

    (firebaseAuth.signOut as jest.Mock).mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signIn('test@example.com', 'password123');
    });

    expect(signInResult).toEqual({
      success: false,
      error: 'Please verify your email before signing in.',
      emailNotVerified: true,
    });
    expect(firebaseAuth.signOut).toHaveBeenCalled();

    process.env.EXPO_PUBLIC_ALLOW_UNVERIFIED_LOGIN = originalEnv;
  });

  it('should handle rate limiting during sign-in', async () => {
    const blockedUntil = new Date(Date.now() + 60000);
    
    (rateLimitService.checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      attemptsRemaining: 0,
      blockedUntil,
    });

    (rateLimitService.getRateLimitError as jest.Mock).mockReturnValue(
      'Too many login attempts. Please try again in 1 minute.'
    );

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signIn('test@example.com', 'password123');
    });

    expect(signInResult).toEqual({
      success: false,
      error: 'Too many login attempts. Please try again in 1 minute.',
    });
    expect(firebaseAuth.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('should handle invalid credentials error', async () => {
    (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/invalid-credential',
      message: 'Invalid credentials',
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signIn('test@example.com', 'wrongpassword');
    });

    expect(signInResult).toEqual({
      success: false,
      error: "That email and password don't match.",
    });
  });
});

describe('AuthContext - Sign Up Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (monitoringService.trackEvent as jest.Mock).mockResolvedValue(undefined);
    (monitoringService.reportError as jest.Mock).mockResolvedValue(undefined);
  });

  it('should successfully sign up with valid data', async () => {
    const mockUser = {
      uid: 'new-user-123',
      email: 'newuser@example.com',
    };

    (firebaseAuth.createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: mockUser,
    });

    (firebaseAuth.sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
    (firestore.setDoc as jest.Mock).mockResolvedValue(undefined);
    (firebaseAuth.signOut as jest.Mock).mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signUpResult;
    await act(async () => {
      signUpResult = await result.current.signUp(
        'newuser@example.com',
        'Rt7kQz2mVx9#',
        'John',
        'Doe',
        '+1234567890',
        'client'
      );
    });

    expect(signUpResult).toEqual({
      success: true,
      needsVerification: true,
    });

    expect(firebaseAuth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'newuser@example.com',
      'Rt7kQz2mVx9#'
    );
    expect(firebaseAuth.sendEmailVerification).toHaveBeenCalled();
    expect(firestore.setDoc).toHaveBeenCalled();
    expect(firebaseAuth.signOut).toHaveBeenCalled();
    expect(monitoringService.trackEvent).toHaveBeenCalledWith(
      'user_signup',
      expect.objectContaining({
        role: 'client',
        userId: mockUser.uid,
      }),
      mockUser.uid
    );
  });

  it('never lets a user sign up as admin', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    let signUpResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      signUpResult = await result.current.signUp('x@example.com', 'Rt7kQz2mVx9#', 'A', 'B', '+525512345678', 'admin');
    });

    expect(signUpResult?.success).toBe(false);
    expect(firebaseAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('writes the profile before signing the new user out', async () => {
    const order: string[] = [];
    (firebaseAuth.createUserWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: { uid: 'u1', email: 'a@b.co' } });
    (firestore.setDoc as jest.Mock).mockImplementation(async () => { order.push('setDoc'); });
    (firebaseAuth.sendEmailVerification as jest.Mock).mockImplementation(async () => { order.push('verify'); });
    (firebaseAuth.signOut as jest.Mock).mockImplementation(async () => { order.push('signOut'); });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signUp('a@b.co', 'Rt7kQz2mVx9#', 'A', 'B', '+525512345678', 'guard');
    });

    expect(order).toEqual(['setDoc', 'verify', 'signOut']);
    expect((firestore.setDoc as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({ role: 'guard', kycStatus: 'pending', isActive: true })
    );
  });

  it('should reject weak passwords', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signUpResult: { success: boolean; error?: string; needsVerification?: boolean } | undefined;
    await act(async () => {
      signUpResult = await result.current.signUp(
        'newuser@example.com',
        'weak',
        'John',
        'Doe',
        '+1234567890',
        'client'
      );
    });

    expect(signUpResult?.success).toBe(false);
    expect(signUpResult?.error).toContain('Password is not strong enough');
    expect(firebaseAuth.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('should handle email already in use error', async () => {
    (firebaseAuth.createUserWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/email-already-in-use',
      message: 'Email already in use',
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signUpResult;
    await act(async () => {
      signUpResult = await result.current.signUp(
        'existing@example.com',
        'Rt7kQz2mVx9#',
        'John',
        'Doe',
        '+1234567890',
        'client'
      );
    });

    expect(signUpResult).toEqual({
      success: false,
      error: 'An account with this email already exists. Try signing in.',
    });
  });
});

describe('AuthContext - Email Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (firebaseAuth.signOut as jest.Mock).mockResolvedValue(undefined);
  });

  const render = () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    return renderHook(() => useAuth(), { wrapper });
  };

  it('should resend verification email successfully', async () => {
    const mockUser = { uid: 'test-user-123', email: 'test@example.com', emailVerified: false };
    (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: mockUser });
    (firebaseAuth.sendEmailVerification as jest.Mock).mockResolvedValue(undefined);

    const { result } = render();
    let resendResult;
    await act(async () => {
      resendResult = await result.current.resendVerificationEmail('test@example.com', 'pw');
    });

    expect(resendResult).toEqual({ success: true });
    expect(firebaseAuth.sendEmailVerification).toHaveBeenCalledWith(mockUser);
    expect(firebaseAuth.signOut).toHaveBeenCalled();
  });

  it('should handle already verified email', async () => {
    (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockResolvedValue({
      user: { uid: 'test-user-123', email: 'test@example.com', emailVerified: true },
    });

    const { result } = render();
    let resendResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      resendResult = await result.current.resendVerificationEmail('test@example.com', 'pw');
    });

    expect(resendResult?.success).toBe(false);
    expect(resendResult?.error).toMatch(/already verified/i);
    expect(firebaseAuth.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('should fail cleanly when the credentials are wrong', async () => {
    (firebaseAuth.signInWithEmailAndPassword as jest.Mock).mockRejectedValue({ code: 'auth/invalid-credential' });

    const { result } = render();
    let resendResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      resendResult = await result.current.resendVerificationEmail('test@example.com', 'wrong');
    });

    expect(resendResult?.success).toBe(false);
    expect(firebaseAuth.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('password reset does not reveal whether an account exists', async () => {
    (firebaseAuth.sendPasswordResetEmail as jest.Mock).mockRejectedValue({ code: 'auth/user-not-found' });

    const { result } = render();
    let out: { success: boolean } | undefined;
    await act(async () => {
      out = await result.current.resetPassword('nobody@example.com');
    });

    expect(out).toEqual({ success: true });
  });
});

describe('AuthContext - Profile gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (firebaseAuth.signOut as jest.Mock).mockResolvedValue(undefined);
  });

  const signedInAs = async (profile: Record<string, unknown>) => {
    (firebaseAuth.onAuthStateChanged as jest.Mock).mockImplementation(
      (_auth: unknown, callback: (u: unknown) => void) => {
        callback({ uid: 'u1', email: 'u1@example.com', emailVerified: true });
        return () => {};
      }
    );
    (firestore.getDoc as jest.Mock).mockResolvedValue({ exists: () => true, data: () => profile });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const hook = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return hook;
  };

  it('signs out a suspended account and explains why', async () => {
    const { result } = await signedInAs({ role: 'client', suspended: true, email: 'u1@example.com' });
    expect(result.current.user).toBeNull();
    expect(result.current.authError).toMatch(/suspended/i);
    expect(firebaseAuth.signOut).toHaveBeenCalled();
  });

  it('rejects a profile with an unknown role instead of looping', async () => {
    const { result } = await signedInAs({ role: 'bodyguard', email: 'u1@example.com' });
    expect(result.current.user).toBeNull();
    expect(result.current.authError).toBeTruthy();
  });

  it('loads a valid profile and stops loading', async () => {
    const { result } = await signedInAs({ role: 'guard', email: 'u1@example.com', firstName: 'Diego' });
    expect(result.current.user?.role).toBe('guard');
    expect(result.current.isLoading).toBe(false);
  });
});

describe('AuthContext - Session Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should sign out successfully', async () => {
    (firebaseAuth.signOut as jest.Mock).mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signOut();
    });

    expect(firebaseAuth.signOut).toHaveBeenCalled();
  });

  it('should update user data successfully', async () => {
    // Antes esta prueba "iniciaba sesion" asignando `result.current.user = ...`.
    // Eso no hace nada: result.current es una foto del valor que devolvio el
    // hook, no el estado del contexto. El usuario nunca entraba, updateUser
    // salia en su primera linea (`if (!user) return`) y updateDoc no se
    // llamaba jamas.
    //
    // AuthContext solo llena el usuario dentro del callback de
    // onAuthStateChanged, que es como se comporta Firebase de verdad. Asi que
    // aqui se hace que el mock dispare ese callback, que es lo que la prueba
    // deberia haber hecho desde el principio.
    const mockAuthUser = {
      uid: 'test-user-123',
      email: 'test@example.com',
      emailVerified: true,
    };
    const mockUserData = {
      email: 'test@example.com',
      role: 'client',
      firstName: 'Test',
      lastName: 'User',
      phone: '+1234567890',
      language: 'en',
      kycStatus: 'approved',
      createdAt: '2024-01-01T00:00:00Z',
      isActive: true,
      emailVerified: true,
      updatedAt: '2024-01-01T00:00:00Z',
    };

    (firebaseAuth.onAuthStateChanged as jest.Mock).mockImplementation(
      (_auth: unknown, callback: (u: unknown) => void) => {
        callback(mockAuthUser);
        return () => {};
      }
    );
    (firestore.getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => mockUserData,
    });
    (firestore.updateDoc as jest.Mock).mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Deja que el callback de autenticacion y su lectura de Firestore terminen.
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.updateUser({ firstName: 'Updated' });
    });

    expect(firestore.updateDoc).toHaveBeenCalled();
  });
});
