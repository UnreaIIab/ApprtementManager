"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BarChart3, CalendarDays, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { loginSchema, type LoginFormValues } from "@/lib/schemas";
import { useT } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { BrandMark } from "@/components/layout/sidebar";

export default function LoginPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center">
          <Loader2 className="size-5 animate-spin text-ink-3" aria-label={t.ui.loading} />
        </div>
      }
    >
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, sendPasswordReset } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const next = searchParams.get("next") ?? "/";

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await signIn(values.email, values.password);
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.auth.couldNotSignIn);
    }
  });

  const resetPassword = async () => {
    const email = getValues("email");
    if (!email) {
      setError(t.auth.enterEmailFirst);
      return;
    }
    try {
      await sendPasswordReset(email);
      toast.success(t.auth.resetLinkSent, { description: `Check ${email} for instructions.` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.auth.couldNotSendReset);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* --- Form ---------------------------------------------------- */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2.5">
            <BrandMark size={34} />
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
              Atlas<span className="text-brand">Stays</span>
            </span>
          </div>

          <h1 className="mt-9 text-[26px] font-semibold tracking-[-0.03em] text-ink">
            {t.auth.signIn}
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-2">
            {t.auth.signInSubtitle}
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-critical/30 bg-critical-wash px-3.5 py-3 text-[13px] text-ink"
              >
                {error}
              </p>
            ) : null}

            <Field label={t.common.email} error={errors.email?.message} htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                {...register("email")}
              />
            </Field>

            <Field label={t.auth.password} error={errors.password?.message} htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register("password")}
              />
            </Field>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={resetPassword}
                className="text-[12.5px] font-medium text-brand hover:underline"
              >
                {t.auth.forgotPassword}
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={isSubmitting}
            >
              {t.auth.signIn}
            </Button>
          </form>

          <p className="mt-8 text-[12px] leading-relaxed text-ink-3">
            {t.auth.sessionNote}
          </p>
        </div>
      </div>

      {/* --- Marketing panel ------------------------------------------ */}
      <aside className="relative hidden overflow-hidden lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(140deg, var(--brand) 0%, #ff7a5c 42%, #f0a35e 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-25"
          style={{
            background:
              "radial-gradient(circle at 78% 18%, rgba(255,255,255,0.85), transparent 45%)",
          }}
        />

        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <h2 className="max-w-md text-[32px] font-semibold leading-tight tracking-[-0.03em]">
            {t.auth.heroTitle}
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/85">
            {t.auth.heroBody}
          </p>

          <ul className="mt-9 grid max-w-md gap-3">
            <Highlight
              icon={<CalendarDays className="size-4" />}
              title={t.auth.dragAndDropCalendar}
              body={t.auth.dragAndDropHint}
            />
            <Highlight
              icon={<BarChart3 className="size-4" />}
              title={t.auth.revenueYouTrust}
              body={t.auth.revenueHint}
            />
            <Highlight
              icon={<ShieldCheck className="size-4" />}
              title={t.auth.secureByConstruction}
              body={t.auth.secureHint}
            />
          </ul>
        </div>
      </aside>
    </div>
  );
}

function Highlight({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-white/12 px-4 py-3 backdrop-blur-sm">
      <span className="mt-0.5 shrink-0 text-white/90">{icon}</span>
      <span>
        <span className="block text-[13.5px] font-semibold">{title}</span>
        <span className="block text-[12.5px] leading-relaxed text-white/80">{body}</span>
      </span>
    </li>
  );
}
