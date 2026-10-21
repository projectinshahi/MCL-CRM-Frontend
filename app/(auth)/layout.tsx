import Image from "next/image";

function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex size-14 shrink-0 items-center justify-center rounded-[14px] border border-stroke2 bg-primary">
        <Image src="/img/logo.png" alt="MCL" width={82} height={72} priority className="h-[42px] w-12 object-contain" />
      </div>
      <div className="flex flex-col">
        <p className="text-[22px] font-bold tracking-[-0.44px]">MCL</p>
        <p className="text-[12px] font-medium opacity-60">CRM PLATFORM</p>
      </div>
    </div>
  );
}

// Login / Forgot Password: full-screen split (Shell skips its sidebar + header on these routes).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden flex-1 flex-col justify-between bg-[linear-gradient(141deg,#152eaf_0%,#304dc3_45%,#6a9bef_100%)] p-10 text-white lg:flex">
        <Brand />
        <div className="flex max-w-[440px] flex-col gap-3">
          <h2 className="text-[32px] leading-[1.2] font-bold tracking-[-0.64px]">Every lead, follow-up and customer in one place.</h2>
          <p className="text-[16px] opacity-80">Track your pipeline, never miss a follow-up, and close more deals with MCL CRM.</p>
        </div>
        <p className="text-[13px] opacity-60">© MCL. All rights reserved.</p>
      </aside>
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="flex w-full max-w-[420px] animate-rise flex-col gap-6 rounded-[20px] border border-stroke2 bg-primary p-6 shadow-[0_12px_40px_rgb(21_46_175/0.08)] sm:p-8">
          <Brand className="text-selected lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
