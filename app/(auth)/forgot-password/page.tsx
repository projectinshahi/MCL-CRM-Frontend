"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/feedback";
import { Field, Spinner, TextInput, ToneIcon } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const btn =
  "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-button text-[15px] font-medium text-white transition-[background-color,transform,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus enabled:hover:bg-secondary enabled:hover:shadow-[0_6px_18px_rgb(21_46_175/0.25)] enabled:active:scale-[0.98] disabled:cursor-wait disabled:opacity-80";
const link = "cursor-pointer rounded-[4px] font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const RESEND_SECONDS = 60; // matches the API's resend cooldown
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[24px] font-semibold tracking-[-0.48px] text-black">{title}</h1>
      <p className="text-[14px] text-muted">{children}</p>
    </div>
  );
}

const BackToLogin = () => (
  <Link href="/login" className={`flex items-center justify-center gap-2 text-[14px] ${link}`}>
    <Icon name="arrow-right" size={18} className="rotate-180" />
    Back to Sign In
  </Link>
);

function Submit({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button suppressHydrationWarning type="submit" disabled={busy} aria-busy={busy} className={btn}>
      {busy && <Spinner />}
      {busy ? busyLabel : label}
    </button>
  );
}

/** Problems that belong to no single field (network, rate limit, expired session). */
function Banner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex animate-rise items-start gap-2 rounded-[14px] border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] font-medium text-danger">
      <ToneIcon tone="error" size={20} />
      <span className="pt-[1px]">{message}</span>
    </div>
  );
}

// Forgot password: email → 6-digit code (OTP) → new password.
// Every message is worded so it never reveals whether an email is registered.
export default function ForgotPasswordPage() {
  const toast = useToast();
  const [step, setStep] = useState<"email" | "code" | "password" | "done">("email");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  /** Runs a step's request once; `onField` maps an expected failure to an inline field message. */
  const run =
    (fn: (f: FormData) => Promise<void>, onField?: (err: ApiError) => Record<string, string> | null) =>
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      setBanner("");
      setFieldError({});
      try {
        await fn(new FormData(e.currentTarget));
      } catch (err) {
        const inline = err instanceof ApiError ? onField?.(err) : null;
        if (inline) setFieldError(inline);
        else setBanner(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
      setBusy(false);
    };

  const sendCode = async (to: string) => {
    await api("/auth/forgot-password", { method: "POST", body: { email: to } });
    setWait(RESEND_SECONDS);
  };
  const resend = async () => {
    setResending(true);
    try {
      await sendCode(email);
      toast.info("Code sent again", "If that email is registered, a new code is on its way. Earlier codes no longer work.");
    } catch (err) {
      toast.apiError(err, "Couldn't send a new code");
    }
    setResending(false);
  };

  if (step === "done")
    return (
      <div className="flex animate-rise flex-col gap-6">
        <div className="flex size-14 items-center justify-center rounded-full border border-stroke2 bg-bg5 text-success">
          <Icon name="mark" size={28} />
        </div>
        <Heading title="Password updated">Sign in with your new password. You have been signed out on every other device.</Heading>
        <Link href="/login" className={btn}>
          Back to Sign In
        </Link>
      </div>
    );

  if (step === "password")
    return (
      <form
        noValidate
        onSubmit={run(
          async (f) => {
            const password = String(f.get("password") ?? "");
            if (password.length < 8) throw new ApiError(422, "FIELD", "", { password: "Use at least 8 characters" });
            if (password !== f.get("confirm")) throw new ApiError(422, "FIELD", "", { confirm: "The passwords don't match" });
            await api("/auth/reset-password", { method: "POST", body: { resetToken, password } });
            toast.success("Password updated", "Sign in with your new password.");
            setStep("done");
          },
          (err) => (err.code === "FIELD" ? err.fields! : err.fields?.password ? { password: err.fields.password } : null),
        )}
        className="flex animate-rise flex-col gap-6"
      >
        <Heading title="Set a new password">Choose a password of at least 8 characters.</Heading>
        <Banner message={banner} />
        <Field label="New password" error={fieldError.password}>
          <TextInput type="password" name="password" maxLength={128} autoComplete="new-password" autoFocus aria-invalid={!!fieldError.password} />
        </Field>
        <Field label="Confirm password" error={fieldError.confirm}>
          <TextInput type="password" name="confirm" maxLength={128} autoComplete="new-password" aria-invalid={!!fieldError.confirm} />
        </Field>
        <Submit busy={busy} label="Update Password" busyLabel="Updating…" />
        <BackToLogin />
      </form>
    );

  if (step === "code")
    return (
      <form
        noValidate
        onSubmit={run(
          async (f) => {
            const otp = String(f.get("otp") ?? "").trim();
            if (!/^\d{6}$/.test(otp)) throw new ApiError(422, "FIELD", "", { otp: "Enter the 6-digit code from the email" });
            const res = await api<{ resetToken: string }>("/auth/verify-otp", { method: "POST", body: { email, otp } });
            setResetToken(res.resetToken);
            setStep("password");
          },
          (err) => (err.code === "FIELD" ? err.fields! : err.code === "INVALID_OTP" ? { otp: "That code is incorrect or has expired. Check the latest email, or resend the code." } : null),
        )}
        className="flex animate-rise flex-col gap-6"
      >
        <div className="flex size-14 items-center justify-center rounded-full border border-stroke2 bg-bg5 text-link">
          <Icon name="mail" size={28} />
        </div>
        <Heading title="Check your email">
          If <span className="font-semibold text-black">{email}</span> belongs to an account, we sent it a 6-digit code. It expires in 10 minutes.
        </Heading>
        <Banner message={banner} />
        <Field label="Verification code" error={fieldError.otp}>
          <TextInput name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus aria-invalid={!!fieldError.otp} className="tracking-[6px]" />
        </Field>
        <Submit busy={busy} label="Verify Code" busyLabel="Verifying…" />
        <p className="text-center text-[14px] text-muted">
          Didn&apos;t get it?{" "}
          <button suppressHydrationWarning type="button" disabled={wait > 0 || resending} onClick={resend} className={`${link} disabled:cursor-default disabled:text-muted disabled:no-underline`}>
            {resending ? "Sending…" : wait > 0 ? `Resend in ${wait}s` : "Resend code"}
          </button>
          {" · "}
          <button suppressHydrationWarning type="button" onClick={() => setStep("email")} className={link}>
            Use another email
          </button>
        </p>
      </form>
    );

  return (
    <form
      noValidate
      onSubmit={run(
        async (f) => {
          const to = String(f.get("email") ?? "").trim();
          if (!EMAIL_RE.test(to)) throw new ApiError(422, "FIELD", "", { email: to ? "Enter a valid email address, like name@company.com" : "Enter your email address" });
          await sendCode(to);
          setEmail(to);
          setStep("code");
        },
        (err) => (err.code === "FIELD" ? err.fields! : err.fields?.email ? { email: err.fields.email } : null),
      )}
      className="flex flex-col gap-6"
    >
      <Heading title="Forgot password?">Enter your registered email and we&apos;ll send you a code to reset your password.</Heading>
      <Banner message={banner} />
      <Field label="Email" error={fieldError.email}>
        <TextInput type="email" name="email" autoComplete="email" placeholder="you@company.com" defaultValue={email} autoFocus aria-invalid={!!fieldError.email} />
      </Field>
      <Submit busy={busy} label="Send Code" busyLabel="Sending…" />
      <BackToLogin />
    </form>
  );
}
