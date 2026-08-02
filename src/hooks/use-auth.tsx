"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { clearOrgCache } from "@/data/repository";

interface AuthValue {
  user: User | null;
  /** Display name for the user menu, falling back to the email local part. */
  name: string;
  email: string;
  loading: boolean;
  /** False when Supabase credentials are absent, so auth cannot run. */
  authEnabled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getBrowserSupabase();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // Keeps the UI in step with token refreshes and sign-outs in other tabs.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") {
        clearOrgCache();
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await getBrowserSupabase().auth.signOut();
    }
    clearOrgCache();
    queryClient.clear();
    router.push("/login");
  }, [queryClient, router]);

  const changePassword = useCallback(async (newPassword: string) => {
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const email = user?.email ?? "";
    const metaName = user?.user_metadata?.full_name as string | undefined;
    return {
      user,
      email,
      name: metaName || email.split("@")[0] || "Account",
      loading,
      authEnabled: isSupabaseConfigured,
      signIn,
      signOut,
      changePassword,
      sendPasswordReset,
    };
  }, [user, loading, signIn, signOut, changePassword, sendPasswordReset]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
