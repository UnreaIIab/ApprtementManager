"use client";

import { AlertTriangle, Database } from "lucide-react";
import { missingSupabaseVars } from "@/lib/supabase/env";
import { useT } from "@/i18n";
import { BrandMark } from "./sidebar";

/**
 * Shown when the Supabase environment variables are absent.
 *
 * This replaces what used to be a silent fallback to a generated dataset. A
 * deployment missing its credentials would previously look completely healthy
 * while every figure on screen was fictional — the worst possible failure mode
 * for software people make pricing and occupancy decisions with. Failing
 * visibly, and naming the exact variable that is missing, is the honest
 * behaviour.
 */
export function SetupRequired() {
  const t = useT();
  const missing = missingSupabaseVars();

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2.5">
          <BrandMark size={34} />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            Atlas<span className="text-brand">Stays</span>
          </span>
        </div>

        <div className="mt-8 rounded-card border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-wash text-warning">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
                {t.setup.notConfiguredTitle}
              </h1>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
                {missing.length === 1 ? t.setup.noDatabaseOne : t.setup.noDatabaseMany}
              </p>
            </div>
          </div>

          <ul className="mt-5 space-y-1.5">
            {missing.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 rounded-lg bg-critical-wash px-3 py-2 font-mono text-[12.5px] text-ink"
              >
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-critical" />
                {name}
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-5">
            <p className="text-[12.5px] font-medium text-ink">
              {t.setup.createEnvFile}{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5">.env.local</code>{" "}
              {t.setup.inProjectRoot}
            </p>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink-2">
{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>`}
            </pre>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              {t.setup.bothComeFrom}{" "}
              <span className="text-ink-2">Project Settings → API</span>.{" "}
              {t.setup.useAnonKey} <span className="text-ink-2">anon</span> —{" "}
              {t.setup.neverServiceRole}{" "}
              <span className="text-ink-2">service_role</span>, {t.setup.serviceRoleWarning}
            </p>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              {t.setup.inlinedAtBuild}
            </p>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
            <Database className="size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              {t.setup.fullWalkthrough}{" "}
              <span className="font-medium text-ink">docs/supabase-setup.md</span>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
