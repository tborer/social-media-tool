import React, { createContext, useState, ReactNode, useEffect } from 'react';
import { createClient } from '@/util/supabase/component';
import { User } from '@supabase/supabase-js';
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from 'next/router';
import prisma from '@/lib/prisma';

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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const supabase = createClient();
  const { toast } = useToast();

  // Sync a Supabase user to the Prisma users table (no credentials stored)
  const createUser = async (u: User) => {
    try {
      // Upsert Prisma user using Supabase user id as primary key
      await prisma.user.upsert({
        where: { id: u.id },
        update: {
          email: u.email || undefined,
          updatedAt: new Date(),
        },
        create: {
          id: u.id,
          email: u.email || undefined,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      console.error('createUser upsert error:', error);
    }
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    }
    if (data?.user) {
      await createUser(data.user);
      setUser(data.user);
    }
    toast({ title: 'Success', description: 'Sign up successful! Check your email if verification is required.' });
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      throw error;
    }
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

    const { subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
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
