"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/feedback";
import { Field, Spinner, TextInput, ToneIcon } from "@/components/ui";
import { landing } from "@/lib/modules";
import { api, ApiError } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Fields = { email?: string; password?: string };

const checkEmail = (email: string) =>
  !email ? "Enter your email address" : !EMAIL_RE.test(email) ? "Enter a valid email address, like name@company.com" : undefined;

// What the person sees for each server answer. The server never says whether an email exists.
function loginError(err: unknown) {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  if (err.code === "INVALID_CREDENTIALS") return "The email or password is incorrect. Check both and try again.";
  if (err.code === "ACCOUNT_INACTIVE") return "This account has been deactivated. Ask an administrator to restore it.";
  if (err.code === "RATE_LIMITED") return "Too many sign-in attempts. Wait a minute, then try again.";
  return err.message; // network / server unreachable messages come from lib/api.ts
}

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Fields>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status !== "idle") return; // one sign-in request at a time
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const problems: Fields = { email: checkEmail(email), password: password ? undefined : "Enter your password" };
    setFields(problems);
    if (problems.email || problems.password) {
      (problems.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setError("");
    setStatus("pending");
    try {
      const { user } = await api<{ user: { name: string; permissions: string[] } }>("/auth/login", { method: "POST", body: { email, password, remember: f.get("remember") === "on" } });
      setStatus("success"); // only after the server has set the session
      toast.success(`Welcome back, ${user.name}`);
      // The Modules page, or the page that sent the user here (proxy.ts adds ?next=) when the role may open it.
      router.replace(landing(user.permissions, new URLSearchParams(window.location.search).get("next")));
    } catch (err) {
      setStatus("idle");
      setError(loginError(err));
      passwordRef.current?.select();
    }
  };

  const busy = status !== "idle";

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5" aria-busy={status === "pending"}>
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-[-0.48px] text-black">Welcome back</h1>
        <p className="text-[14px] text-muted">Sign in to your MCL CRM account</p>
      </div>

      {error && (
        <div role="alert" className="flex animate-rise items-start gap-2 rounded-[14px] border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] font-medium text-danger">
          <ToneIcon tone="error" size={20} />
          <span className="pt-[1px]">{error}</span>
        </div>
      )}

      <Field label="Email" error={fields.email}>
        <TextInput
          ref={emailRef}
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          aria-invalid={!!fields.email}
          onBlur={(e) => e.target.value && setFields((f) => ({ ...f, email: checkEmail(e.target.value.trim()) }))}
          onChange={() => fields.email && setFields((f) => ({ ...f, email: undefined }))}
        />
      </Field>

      <Field label="Password" error={fields.password}>
        <div className="relative">
          <TextInput
            ref={passwordRef}
            type={show ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            className="pr-11!"
            aria-invalid={!!fields.password}
            onChange={() => fields.password && setFields((f) => ({ ...f, password: undefined }))}
          />
          <button
            suppressHydrationWarning
            type="button"
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            onClick={() => setShow(!show)}
            className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-nav transition-colors hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Icon name="eye" size={18} className={`transition-opacity ${show ? "" : "opacity-50"}`} />
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-[14px] font-medium text-nav">
          <input suppressHydrationWarning type="checkbox" name="remember" className="size-4 cursor-pointer accent-button" />
          Remember me
        </label>
        <Link href="/forgot-password" className="rounded-[4px] text-[14px] font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Forgot password?
        </Link>
      </div>

      <button
        suppressHydrationWarning
        type="submit"
        disabled={busy}
        aria-busy={status === "pending"}
        className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] text-[15px] font-medium text-white transition-[background-color,transform,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus enabled:hover:bg-secondary enabled:hover:shadow-[0_6px_18px_rgb(21_46_175/0.25)] enabled:active:scale-[0.98] disabled:cursor-wait ${
          status === "success" ? "bg-success" : "bg-button"
        }`}
      >
        {status === "pending" && <Spinner />}
        {status === "success" && (
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12.5l4 4L18 8.5" />
          </svg>
        )}
        {status === "pending" ? "Signing in…" : status === "success" ? "Signed in" : "Sign In"}
      </button>
    </form>
  );
}
