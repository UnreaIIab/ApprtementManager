"use client";

import { AlertTriangle, LogOut, ShieldQuestion } from "lucide-react";
import { NO_WORKSPACE } from "@/data/repository";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/**
 * Shown when the working set cannot be loaded.
 *
 * The case worth separating is "signed in but not a member of any
 * organisation". Because memberships are granted server-side, a colleague can
 * authenticate before they have been given access — at which point row-level
 * security correctly hides everything, and without this they would see an empty
 * app or a raw Postgres error and conclude the product is broken.
 */
export function WorkspaceError({ error }: { error: Error }) {
  const t = useT();
  const { email, signOut } = useAuth();
  const noWorkspace = error.message === NO_WORKSPACE;

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span
            className={
              noWorkspace
                ? "grid size-9 shrink-0 place-items-center rounded-xl bg-info-wash text-info"
                : "grid size-9 shrink-0 place-items-center rounded-xl bg-critical-wash text-critical"
            }
          >
            {noWorkspace ? (
              <ShieldQuestion className="size-4" aria-hidden />
            ) : (
              <AlertTriangle className="size-4" aria-hidden />
            )}
          </span>

          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
              {noWorkspace ? t.workspace.noWorkspace : t.workspace.loadFailed}
            </h1>

            {noWorkspace ? (
              <>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                  {t.workspace.notMemberYet(email || t.workspace.thisAccount)}
                </p>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">
                  {t.workspace.askOwner}{" "}
                  <code className="rounded bg-surface-2 px-1 py-0.5">
                    bootstrap_workspace(&apos;{email || "you@example.com"}&apos;)
                  </code>{" "}
                  {t.workspace.inSqlEditor}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                  {t.workspace.rejected}
                </p>
                <p className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-2">
                  {error.message}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-line pt-5">
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t.workspace.reload}
          </Button>
          <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
            {t.chrome.signOut}
          </Button>
        </div>
      </div>
    </div>
  );
}
