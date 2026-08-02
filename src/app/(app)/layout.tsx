import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SetupRequired } from "@/components/layout/setup-required";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function AppLayout({ children }: { children: ReactNode }) {
  // Gated here rather than inside AppShell so the decision happens before any
  // hook runs: a deployment without credentials gets setup instructions, not a
  // cascade of failed queries behind a fully-rendered shell.
  if (!isSupabaseConfigured) return <SetupRequired />;

  return <AppShell>{children}</AppShell>;
}
