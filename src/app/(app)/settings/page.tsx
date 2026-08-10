"use client";

import { Suspense, useState } from "react";
import { useIsClient } from "@/hooks/use-client";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Bell, Building2, Check, Database, FileText, KeyRound, Palette, Plug,
  ShieldCheck, Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  organizationSchema, passwordSchema, type OrganizationFormValues,
} from "@/lib/schemas";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization, useSnapshot, useUpdateOrganization } from "@/data/queries";
import { NOTIFICATION_RULE_KEYS, notificationSettings } from "@/lib/notification-settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/feedback";
import { exportCsv } from "@/lib/utils";
import { LOCALES, dictionaryFor, normaliseLocale, strings, useT } from "@/i18n";

/** Each language is named in itself, the way a language picker should read. */
const LANGUAGE_NAMES = Object.fromEntries(
  LOCALES.map((code) => [code, dictionaryFor(code).name]),
) as Record<(typeof LOCALES)[number], string>;

type Tab = "company" | "invoicing" | "appearance" | "notifications" | "team" | "security" | "data";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CAD", "AUD", "MAD"];
const TIMEZONES = [
  "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Paris", "Europe/Berlin",
  "Europe/Rome", "Europe/Amsterdam", "Africa/Casablanca", "America/New_York",
  "America/Los_Angeles", "Asia/Dubai", "Asia/Tokyo", "UTC",
];

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  );
}

function SettingsView() {
  const t = useT();
  const searchParams = useSearchParams();
  // The tab comes from the URL when present (so `/settings?tab=security` from
  // the user menu lands correctly) and from local state once the user picks one.
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const tab = chosenTab ?? ((searchParams.get("tab") as Tab | null) ?? "company");
  const setTab = setChosenTab;

  return (
    <>
      <PageHeader
        title={t.settings.title}
        description={t.settings.description}
      />

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "company", label: t.settings.tabCompany, icon: <Building2 /> },
          { value: "invoicing", label: t.settings.tabInvoicing, icon: <FileText /> },
          { value: "appearance", label: t.settings.tabAppearance, icon: <Palette /> },
          { value: "notifications", label: t.settings.tabNotifications, icon: <Bell /> },
          { value: "team", label: t.settings.tabTeam, icon: <Users /> },
          { value: "security", label: t.settings.tabSecurity, icon: <ShieldCheck /> },
          { value: "data", label: t.settings.tabData, icon: <Database /> },
        ]}
      />

      {tab === "company" || tab === "invoicing" ? <CompanySettings tab={tab} /> : null}
      {tab === "appearance" ? <AppearanceSettings /> : null}
      {tab === "notifications" ? <NotificationSettings /> : null}
      {tab === "team" ? <TeamSettings /> : null}
      {tab === "security" ? <SecuritySettings /> : null}
      {tab === "data" ? <DataSettings /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

function CompanySettings({ tab }: { tab: "company" | "invoicing" }) {
  const t = useT();
  const organization = useOrganization();
  const updateOrganization = useUpdateOrganization();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    values: organization
      ? {
          name: organization.name,
          legal_name: organization.legal_name ?? "",
          email: organization.email ?? "",
          phone: organization.phone ?? "",
          address: organization.address ?? "",
          tax_id: organization.tax_id ?? "",
          currency: organization.currency,
          tax_rate: organization.tax_rate,
          timezone: organization.timezone,
          locale: normaliseLocale(organization.locale),
          invoice_prefix: organization.invoice_prefix,
          booking_prefix: organization.booking_prefix,
        }
      : undefined,
  });

  const onSubmit = handleSubmit(async (values) => {
    await updateOrganization.mutateAsync({
      ...values,
      legal_name: values.legal_name || null,
      email: values.email || null,
      phone: values.phone || null,
      address: values.address || null,
      tax_id: values.tax_id || null,
    });
    reset(values);
  });

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader
          title={tab === "company" ? t.settings.companyInformation : "Invoicing"}
          description={
            tab === "company"
              ? t.settings.companyDescription
              : t.settings.invoicingDescription
          }
        />
        <CardBody>
          {tab === "company" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.settings.companyName} required error={errors.name?.message} htmlFor="org-name">
                <Input id="org-name" {...register("name")} />
              </Field>
              <Field label={t.settings.legalName} htmlFor="org-legal">
                <Input id="org-legal" {...register("legal_name")} />
              </Field>
              <Field label={t.common.email} error={errors.email?.message} htmlFor="org-email">
                <Input id="org-email" type="email" {...register("email")} />
              </Field>
              <Field label={t.common.phone} htmlFor="org-phone">
                <Input id="org-phone" type="tel" {...register("phone")} />
              </Field>
              <Field label={t.common.address} className="sm:col-span-2" htmlFor="org-address">
                <Textarea id="org-address" rows={2} {...register("address")} />
              </Field>
              <Field label={t.settings.taxId} htmlFor="org-tax-id">
                <Input id="org-tax-id" {...register("tax_id")} />
              </Field>
              <Field label={t.settings.timezone} htmlFor="org-tz">
                <Select id="org-tz" {...register("timezone")}>
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t.settings.language}
                hint={t.settings.languageHint}
                htmlFor="org-locale"
              >
                <Select id="org-locale" {...register("locale")}>
                  {LOCALES.map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_NAMES[code]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t.common.currency}
                error={errors.currency?.message}
                hint={t.settings.currencyHint}
                htmlFor="org-currency"
              >
                <Select id="org-currency" {...register("currency")}>
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t.settings.taxRate}
                error={errors.tax_rate?.message}
                hint={t.settings.taxRateHint}
                htmlFor="org-tax"
              >
                <Input
                  id="org-tax"
                  type="number"
                  step="0.5"
                  min={0}
                  max={100}
                  {...register("tax_rate", { valueAsNumber: true })}
                />
              </Field>
              <Field label={t.settings.invoicePrefix} error={errors.invoice_prefix?.message} htmlFor="org-inv">
                <Input id="org-inv" {...register("invoice_prefix")} />
              </Field>
              <Field label={t.settings.bookingPrefix} error={errors.booking_prefix?.message} htmlFor="org-bkg">
                <Input id="org-bkg" {...register("booking_prefix")} />
              </Field>

              <div className="sm:col-span-2">
                <h3 className="mb-2 text-[13px] font-medium text-ink">{t.settings.cancellationPolicy}</h3>
                <div className="space-y-1 rounded-xl border border-line p-4">
                  <Checkbox
                    defaultChecked
                    label={t.settings.freeCancellation}
                    description={t.settings.fullRefundInside}
                  />
                  <Checkbox
                    defaultChecked
                    label={t.settings.refund50}
                  />
                  <Checkbox label={t.settings.noRefundNoShow} defaultChecked />
                </div>
              </div>

              <Field label={t.settings.invoiceFooter} className="sm:col-span-2" htmlFor="org-terms">
                <Textarea
                  id="org-terms"
                  rows={3}
                  defaultValue={t.settings.paymentDue}
                />
              </Field>
            </div>
          )}
        </CardBody>
        <CardFooter>
          <p className="text-[12.5px] text-ink-3">
            {isDirty ? t.settings.unsavedChanges : t.settings.allSaved}
          </p>
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
            {t.common.saveChanges}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function AppearanceSettings() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const mounted = useIsClient();

  const options = [
    { value: "light", label: "Light", description: t.settings.lightHint },
    { value: "dark", label: "Dark", description: t.settings.darkHint },
    { value: "system", label: "System", description: t.settings.systemHint },
  ];

  return (
    <Card>
      <CardHeader
        title={t.settings.tabAppearance}
        description={t.settings.themesDesigned}
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-3">
          {options.map((option) => {
            const active = mounted && theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setTheme(option.value)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-ink bg-surface-3"
                    : "border-line hover:border-line-strong hover:bg-surface-2"
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-ink">{option.label}</span>
                  {active ? <Check className="size-4 text-brand" aria-hidden /> : null}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-2">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[13px] font-medium text-ink">{t.settings.chartPalette}</h3>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {t.settings.paletteNote2}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <span
                  aria-hidden
                  className="size-5 rounded-md"
                  style={{ background: `var(--series-${index + 1})` }}
                />
                {index + 1}
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/* Module scope, so each label reads the active dictionary when accessed. */
/*
 * Driven by the shared key list, so a rule cannot exist in the UI without the
 * scheduled job knowing about it — or the reverse.
 */
const RULE_COPY: Record<string, [labelKey: string, hintKey: string]> = {
  upcoming_check_in: ["upcomingCheckIn", "upcomingCheckInHint"],
  upcoming_check_out: ["upcomingCheckOut", "upcomingCheckOutHint"],
  late_payment: ["latePayment", "latePaymentHint"],
  invoice_due: ["invoiceDue", "invoiceDueHint"],
  cleaning_reminder: ["cleaningReminder", "cleaningReminderHint"],
  maintenance_reminder: ["maintenanceReminder", "maintenanceReminderHint"],
  booking_conflict: ["bookingConflict", "bookingConflictHint"],
  apartment_available: ["apartmentAvailable", "apartmentAvailableHint"],
};

const NOTIFICATION_RULES = NOTIFICATION_RULE_KEYS.map((key) => ({
  key,
  get label() {
    return strings().settings[RULE_COPY[key][0] as "upcomingCheckIn"];
  },
  get description() {
    return strings().settings[RULE_COPY[key][1] as "upcomingCheckInHint"];
  },
}));

function NotificationSettings() {
  const t = useT();
  const organization = useOrganization();
  const updateOrganization = useUpdateOrganization();

  /*
   * Persisted in `organizations.settings`, a jsonb column that has existed
   * since the first migration and was never written to. Before this the
   * switches lived in component state and "Save" only raised a success toast —
   * the preferences reset on reload, and the scheduled job had nothing to read.
   */
  const saved = notificationSettings(organization?.settings);
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const enabled = draft ?? saved;
  const dirty = draft !== null && NOTIFICATION_RULES.some((r) => draft[r.key] !== saved[r.key]);

  const save = async () => {
    await updateOrganization.mutateAsync({
      settings: { ...(organization?.settings ?? {}), notifications: enabled },
    });
    setDraft(null);
  };

  return (
    <Card>
      <CardHeader
        title={t.settings.notificationPrefs}
        description={t.settings.whichEvents}
      />
      <CardBody>
        <div className="divide-y divide-line">
          {NOTIFICATION_RULES.map((rule) => (
            <div key={rule.key} className="py-3 first:pt-0 last:pb-0">
              <Switch
                label={rule.label}
                description={rule.description}
                checked={enabled[rule.key] ?? true}
                onCheckedChange={(value) =>
                  setDraft({ ...enabled, [rule.key]: value })
                }
              />
            </div>
          ))}
        </div>
      </CardBody>
      <CardFooter>
        <p className="text-[12.5px] text-ink-3">{t.settings.emailNeedsFunction}</p>
        <Button
          variant="primary"
          disabled={!dirty}
          loading={updateOrganization.isPending}
          onClick={() => void save()}
        >
          {t.common.saveChanges}
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const ROLES = [
  ["owner", "ownerHint"],
  ["admin", "adminHint"],
  ["manager", "staffHint"],
  ["staff", "managerHint"],
  ["viewer", "viewerHint"],
].map(([roleKey, hintKey]) => ({
  get role() {
    return strings().settings[roleKey as "owner"];
  },
  get description() {
    return strings().settings[hintKey as "ownerHint"];
  },
}));

function TeamSettings() {
  const t = useT();
  const { name, email } = useAuth();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={t.settings.members} description={t.settings.peopleWithAccess} />
        <CardBody className="px-0">
          <ul className="divide-y divide-line">
            <li className="flex items-center gap-3 px-6 py-3">
              <Avatar name={name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{name}</span>
                <span className="block truncate text-[12px] text-ink-3">{email || "—"}</span>
              </span>
              <Badge tone="brand">{t.settings.owner}</Badge>
            </li>
          </ul>
        </CardBody>
        <CardFooter>
          <p className="text-[12.5px] text-ink-3">
            {t.settings.invitationsViaAuth}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              toast.info(t.settings.inviteFlow, {
                description:
                  t.settings.connectSupabaseAuth,
              })
            }
          >
            {t.settings.inviteMember}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader
          title={t.settings.rolesAndPermissions}
          description={t.settings.rlsHint}
        />
        <CardBody className="px-0">
          <ul className="divide-y divide-line">
            {ROLES.map((entry) => (
              <li key={entry.role} className="px-6 py-3">
                <p className="text-[13.5px] font-medium text-ink">{entry.role}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-2">{entry.description}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SecuritySettings() {
  const t = useT();
  const { changePassword, authEnabled, email } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const result = passwordSchema.safeParse({ password, confirm });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? t.settings.checkPasswordFields);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await changePassword(password);
      toast.success(t.settings.passwordUpdated);
      setPassword("");
      setConfirm("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.settings.couldNotUpdatePassword);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={t.settings.changePassword} description={t.settings.usedToSignIn} />
        <CardBody>
          {!authEnabled ? (
            <p className="rounded-xl bg-warning-wash px-3.5 py-3 text-[13px] text-ink">
              {t.settings.authUnavailable}
            </p>
          ) : (
            <div className="space-y-4">
              <Field label={t.settings.signedInAs}>
                <Input value={email} readOnly disabled />
              </Field>
              <Field label={t.settings.newPassword} error={error ?? undefined} htmlFor="pw-new">
                <Input
                  id="pw-new"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <Field label={t.settings.confirmNewPassword} htmlFor="pw-confirm">
                <Input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </Field>
            </div>
          )}
        </CardBody>
        <CardFooter>
          <p className="text-[12.5px] text-ink-3">{t.settings.atLeast8}</p>
          <Button
            variant="primary"
            icon={<KeyRound className="size-4" />}
            disabled={!authEnabled}
            loading={saving}
            onClick={submit}
          >
            {t.settings.updatePassword}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader title={t.settings.sessionAndAccess} description={t.settings.howProtected} />
        <CardBody>
          <ul className="space-y-3 text-[13px]">
            <Fact
              label={t.settings.authentication}
              value={authEnabled ? t.settings.supabaseAuth : t.settings.notConfigured}
            />
            <Fact label={t.settings.sessionRefresh} value={t.settings.automaticMiddleware} />
            <Fact label={t.settings.routeProtection} value={t.settings.unauthenticatedRedirect} />
            <Fact label={t.settings.rowLevelSecurity} value={t.settings.everyTenantTable} />
            <Fact label={t.settings.dataIsolation} value="org_id on every row, enforced in Postgres" />
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-ink-3">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function DataSettings() {
  const t = useT();
  const { data } = useSnapshot();

  const backup = () => {
    if (!data) return;
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `atlas-stays-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(t.settings.backupDownloaded);
  };

  const counts = data
    ? [
        { label: "Apartments", value: data.apartments.length },
        { label: "Guests", value: data.guests.length },
        { label: "Bookings", value: data.bookings.length },
        { label: "Invoices", value: data.invoices.length },
        { label: "Payments", value: data.payments.length },
        { label: "Expenses", value: data.expenses.length },
        { label: "Tasks", value: data.tasks.length },
      ]
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={t.settings.backupAndExport}
          description={t.settings.downloadWorkingSet}
        />
        <CardBody>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {counts.map((entry) => (
              <li key={entry.label} className="rounded-xl border border-line p-3">
                <p className="text-[11.5px] uppercase tracking-wide text-ink-3">{entry.label}</p>
                <p className="mt-0.5 text-[18px] font-semibold text-ink tnum">{entry.value}</p>
              </li>
            ))}
          </ul>
        </CardBody>
        <CardFooter>
          <p className="text-[12.5px] text-ink-3">{t.settings.jsonSnapshot}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                data &&
                exportCsv(
                  "apartments.csv",
                  data.apartments.map((apartment) => ({
                    code: apartment.code,
                    name: apartment.name,
                    status: apartment.status,
                    nightly_rate: (apartment.nightly_rate / 100).toFixed(2),
                  })),
                )
              }
            >
              {t.reports.exportCsv}
            </Button>
            <Button variant="primary" onClick={backup}>
              Download backup
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader title={t.settings.integrations} description={t.settings.whereDataComesFrom} />
        <CardBody>
          <ul className="space-y-3">
            <Integration
              name="Supabase"
              status={isSupabaseConfigured ? t.settings.connected : t.settings.notConfigured}
              connected={isSupabaseConfigured}
              description={
                isSupabaseConfigured
                  ? t.settings.supabaseHint
                  : t.auth.notConfiguredHint
              }
            />
            <Integration
              name="Airbnb / Booking.com"
              status="Manual"
              connected={false}
              description={t.settings.channelsHint}
            />
            <Integration
              name="Stripe"
              status="Manual"
              connected={false}
              description={t.settings.stripeHint}
            />
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function Integration({
  name,
  status,
  description,
  connected,
}: {
  name: string;
  status: string;
  description: string;
  connected: boolean;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-ink-2">
        <Plug className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium text-ink">{name}</span>
          <Badge tone={connected ? "good" : "neutral"}>{status}</Badge>
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">
          {description}
        </span>
      </span>
    </li>
  );
}
