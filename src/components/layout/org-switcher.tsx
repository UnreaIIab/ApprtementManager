"use client";

import { useState } from "react";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { useCreateWorkspace } from "@/data/queries";
import { Menu } from "@/components/ui/menu";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useT } from "@/i18n";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CAD", "AUD", "MAD"];
const TIMEZONES = [
  "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Paris", "Europe/Berlin",
  "Europe/Rome", "Europe/Amsterdam", "Africa/Casablanca", "America/New_York",
  "America/Los_Angeles", "Asia/Dubai", "Asia/Tokyo", "UTC",
];

/**
 * Company switcher.
 *
 * Each company is a separate tenant: its own currency, tax rate, invoice
 * series, staff and books. Switching is not a filter — it changes which
 * organisation every query and mutation addresses, and the two never mix.
 */
export function OrgSwitcher() {
  const t = useT();
  const { workspaces, active, switchTo, loading } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  // Bumped on each open so the dialog remounts with fresh fields. Resetting via
  // an effect would be a cascading render; remounting is the same outcome in
  // one pass, and keeps the close animation.
  const [createSession, setCreateSession] = useState(0);

  if (loading && !active) {
    return <span className="hidden h-9 w-40 animate-pulse rounded-xl bg-surface-3 sm:block" aria-hidden />;
  }
  if (!active) return null;

  const single = workspaces.length === 1;

  return (
    <>
      <Menu
        align="start"
        className="hidden sm:flex"
        menuClassName="min-w-[264px]"
        trigger={({ toggle, ref, open }) => (
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Current company: ${active.name}. Switch company`}
            className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-3"
          >
            <Building2 className="size-4 shrink-0 text-ink-3" aria-hidden />
            <span className="max-w-[170px] truncate">{active.name}</span>
            <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          </button>
        )}
        items={[
          ...workspaces.map((workspace) => ({
            label: workspace.name,
            // The role is the useful disambiguator when someone manages
            // several companies with similar names.
            hint: `${workspace.role} · ${workspace.currency}`,
            icon:
              workspace.orgId === active.orgId ? <Check /> : <span className="block size-4" />,
            onSelect: () => switchTo(workspace.orgId),
          })),
          {
            label: t.workspace.createCompany,
            hint: single ? t.workspace.createCompanyHint : undefined,
            icon: <Plus />,
            separatorBefore: true,
            onSelect: () => {
              setCreateSession((n) => n + 1);
              setCreateOpen(true);
            },
          },
        ]}
      />

      <CreateCompanyDialog
        key={createSession}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}

function CreateCompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const createWorkspace = useCreateWorkspace();
  const { switchTo } = useWorkspace();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [timezone, setTimezone] = useState("Europe/Lisbon");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setError(t.workspace.companyNameRequired);
      return;
    }
    setError(null);
    try {
      const orgId = await createWorkspace.mutateAsync({
        name: name.trim(),
        currency,
        timezone,
      });
      // Land the user inside what they just made.
      switchTo(orgId);
      onClose();
    } catch {
      // The mutation surfaces the reason as a toast.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.workspace.createCompanyTitle}
      description={t.workspace.createCompanyDescription}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={createWorkspace.isPending}>
            Create company
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.settings.companyName} required error={error ?? undefined} htmlFor="new-org-name">
          <Input
            id="new-org-name"
            data-autofocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.workspace.companyNamePlaceholder}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t.common.currency}
            hint={t.workspace.currencyHint}
            htmlFor="new-org-currency"
          >
            <Select
              id="new-org-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t.settings.timezone} htmlFor="new-org-tz">
            <Select
              id="new-org-tz"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className={cn("rounded-xl bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2")}>
          You&apos;ll be the owner. Apartments, bookings, guests and reports are kept
          entirely separate from your other companies — nothing is shared, and staff
          of one cannot see the other.
        </p>
      </div>
    </Dialog>
  );
}
