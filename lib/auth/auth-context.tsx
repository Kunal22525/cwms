'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { AppRole, Profile } from '@/types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfileAndRole(
  userId: string
): Promise<{ profile: Profile | null; role: AppRole | null }> {
  let profile: Profile | null = null;
  let role: AppRole | null = null;

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, full_name, email, mobile, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (profileData) {
    profile = profileData as Profile;
  }

  // The user_roles table is RLS-locked to admins only, so role is determined
  // via the SECURITY DEFINER has_role() function. Precedence: admin >
  // site_incharge > supervisor.
  const { data: isAdmin } = await supabase.rpc('has_role', { p_role: 'admin' });
  if (isAdmin) {
    role = 'admin';
  } else {
    const { data: isSiteIncharge } = await supabase.rpc('has_role', {
      p_role: 'site_incharge',
    });
    role = isSiteIncharge ? 'site_incharge' : 'supervisor';
  }

  return { profile, role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfileAndRole = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setRole(null);
      return;
    }

    const { profile: p, role: r } = await fetchProfileAndRole(userId);
    setProfile(p);
    setRole(r);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        loadProfileAndRole(data.session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
      loadProfileAndRole(newSession?.user?.id);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileAndRole]);

  const signOut = useCallback(async () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadProfileAndRole(user.id);
  }, [user, loadProfileAndRole]);

  return (
    <AuthContext.Provider
      value={{ user, session, profile, role, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
