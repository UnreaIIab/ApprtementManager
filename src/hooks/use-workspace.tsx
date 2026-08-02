"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listWorkspaces,
  setActiveOrg,
  type Workspace,
} from "@/data/repository";
import { useAuth } from "@/hooks/use-auth";
import { useLocalStore } from "@/hooks/use-local-store";

/**
 * The active company.
 *
 * One user can belong to several companies (`memberships` is unique on
 * org_id + user_id), and each is a fully isolated tenant: its own currency,
 * tax rate, invoice series, staff and books. This decides which one the app is
 * currently looking at.
 *
 * The choice is persisted, but it is always *validated* against the live
 * membership list before use — access can be revoked between sessions, and a
 * stale id would otherwise produce a workspace that loads nothing and explains
 * nothing.
 */
interface WorkspaceValue {
  workspaces: Workspace[];
  active: Workspace | null;
  activeOrgId: string | null;
  /** True while the membership list is still loading. */
  loading: boolean;
  /** True once loaded and the user belongs to no company at all. */
  none: boolean;
  switchTo: (orgId: string) => void;
}

const STORAGE_KEY = "aptmanager.active-org";

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const identity = (raw: string) => raw;

export const workspaceKeys = {
  all: ["workspaces"] as const,
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [storedOrgId, setStoredOrgId] = useLocalStore<string>(
    STORAGE_KEY,
    "",
    identity,
    identity,
  );

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: workspaceKeys.all,
    queryFn: listWorkspaces,
    // Nothing to read until there is a session.
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });

  // A stored id is only honoured if it still matches a real membership;
  // otherwise fall back to the first company, which `listWorkspaces` orders
  // deterministically.
  const active = useMemo(() => {
    if (!workspaces.length) return null;
    return workspaces.find((w) => w.orgId === storedOrgId) ?? workspaces[0];
  }, [workspaces, storedOrgId]);

  // Publishing to the repository is a write to an external system, so it
  // belongs in an effect rather than in render. There is no race: queries are
  // gated on `activeOrgId`, and `currentOrgId()` independently falls back to
  // the same deterministic first company if it is ever asked too early.
  useEffect(() => {
    setActiveOrg(active?.orgId ?? null);
  }, [active?.orgId]);

  const switchTo = useCallback(
    (orgId: string) => {
      if (orgId === active?.orgId) return;
      setActiveOrg(orgId);
      setStoredOrgId(orgId);
      // Snapshot data is keyed by org, so the new company fetches fresh rather
      // than briefly showing the previous one's numbers.
      queryClient.removeQueries({ queryKey: ["snapshot"] });
    },
    [active?.orgId, setStoredOrgId, queryClient],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      workspaces,
      active,
      activeOrgId: active?.orgId ?? null,
      loading: authLoading || (Boolean(user) && isLoading),
      none: Boolean(user) && !isLoading && workspaces.length === 0,
      switchTo,
    }),
    [workspaces, active, authLoading, user, isLoading, switchTo],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return context;
}
