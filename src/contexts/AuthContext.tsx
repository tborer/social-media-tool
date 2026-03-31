import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { createClient } from '@/util/supabase/component';
import { User } from '@supabase/supabase-js';
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from 'next/router';

interface AuthContextType {
  user: User | null;
  createUser: (user: User) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  initializing: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  createUser: async () => {},
  signIn: async () => {},
  signUp: async () => {},
  signInWithMagicLink: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  initializing: false
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const supabase = createClient();
  const { toast } = useToast();

  // Sync a Supabase user to the database via API route
  const createUser = async (_u: User) => {
    try {
      console.log('[AuthContext] createUser: syncing user to database via API...', _u.id);
      const res = await fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.text();
        console.error('[AuthContext] createUser: API returned error', res.status, body);
      } else {
        console.log('[AuthContext] createUser: user synced successfully');
      }
    } catch (error) {
      console.error('[AuthContext] createUser: network error', error);
    }
  };

  const signUp = async (email: string, password: string) => {
    console.log('[AuthContext] signUp: starting sign up...');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error('[AuthContext] signUp: Supabase error', error.message);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    }
    console.log('[AuthContext] signUp: Supabase response', { userId: data?.user?.id, confirmed: data?.user?.email_confirmed_at });
    if (data?.user) {
      await createUser(data.user);
      setUser(data.user);
    }
    toast({ title: 'Success', description: 'Sign up successful! Check your email if verification is required.' });
  };

  const signIn = async (email: string, password: string) => {
    console.log('[AuthContext] signIn: starting sign in...');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[AuthContext] signIn: Supabase error', error.message);
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    }
    console.log('[AuthContext] signIn: success, userId:', data?.user?.id);
    if (data?.user) {
      await createUser(data.user);
      setUser(data.user);
    }
  };

  const signInWithMagicLink = async (email: string) => {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (!error && data.user) {
      await createUser(data.user);
    }
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    } else {
      toast({ title: 'Success', description: 'Check your email for the login link' });
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
      if (error) throw error;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    }
    setUser(null);
    router.push('/login');
  };

  const resetPassword = async (email: string) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    }
    toast({ title: 'Success', description: 'Password reset email sent.' });
    return data;
  };

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;
    const getUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        if (data?.user) {
          setUser(data.user);
          await createUser(data.user);
        }
      } catch (error) {
        console.error('auth init error', error);
      } finally {
        if (mounted) setInitializing(false);
      }
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[AuthContext] onAuthStateChange:', _event, 'userId:', session?.user?.id);
      if (session?.user) {
        setUser(session.user);
        await createUser(session.user);
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, createUser, signIn, signUp, signInWithMagicLink, signInWithGoogle, signOut, resetPassword, initializing }}>
      {children}
    </AuthContext.Provider>
  );
};
