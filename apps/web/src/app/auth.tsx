import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { resetLiveCache } from '@/lib/live';

interface AuthState {
  user: User | null;
  /** True until Firebase has restored (or ruled out) a session. */
  initializing: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Creates users/{uid} on first sign-in. Shape matches the generated security rule. */
async function ensureProfile(user: User) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref).catch(() => null);
  if (snap?.exists() || !user.email) return;
  await setDoc(ref, {
    displayName: (user.displayName ?? '').slice(0, 80),
    defaultTenantId: null,
    theme: 'system',
    email: user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        setUser(u);
        setInitializing(false);
        if (u) void ensureProfile(u);
      }),
    [],
  );

  const signOut = async () => {
    resetLiveCache();
    try {
      localStorage.removeItem('pj.lastTenant');
    } catch {
      /* storage unavailable */
    }
    await fbSignOut(auth);
  };

  return <AuthContext.Provider value={{ user, initializing, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser requires a signed-in user');
  return user;
}
