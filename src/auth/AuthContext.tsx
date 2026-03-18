import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { HybridRole, UserProfile, UserTier } from '../types';

interface AuthUser {
  uid: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  firebaseReady: boolean;
  signUp: (email: string, password: string, djName: string, tier: UserTier, hybridRole?: HybridRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateTier: (tier: UserTier) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function createAuthError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function makeUser(profile: UserProfile): AuthUser {
  return { uid: profile.uid, email: profile.email };
}

async function parseAuthResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw createAuthError(payload?.code || 'auth/unknown', payload?.error || 'Authentication failed');
  }

  const resolvedProfile = payload?.profile as UserProfile | undefined;
  return {
    user: resolvedProfile ? makeUser(resolvedProfile) : null,
    profile: resolvedProfile ?? null,
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.status === 401) {
          if (!cancelled) {
            setUser(null);
            setProfile(null);
          }
        } else {
          const session = await parseAuthResponse(response);
          if (!cancelled) {
            setUser(session.user);
            setProfile(session.profile);
          }
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setProfile(null);
        }
      }

      setLoading(false);
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, djName: string, tier: UserTier, hybridRole?: HybridRole) => {
    const session = await parseAuthResponse(await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, djName, tier, hybridRole }),
    }));
    setUser(session.user);
    setProfile(session.profile);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await parseAuthResponse(await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }));
    setUser(session.user);
    setProfile(session.profile);
  }, []);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setUser(null);
    setProfile(null);
  }, []);

  const updateTier = useCallback(async (tier: UserTier) => {
    if (!user) return;

    const session = await parseAuthResponse(await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    }));

    setUser(session.user);
    setProfile(session.profile);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, firebaseReady: true, signUp, signIn, signOut, updateTier }}>
      {children}
    </AuthContext.Provider>
  );
}
