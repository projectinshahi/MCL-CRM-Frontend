"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { DateField, Field, Modal, ModalActions, Popover, ToolButton } from "@/components/ui";
import { periodLabel, rangeProblem, samePeriod, todayIST, type Period } from "@/lib/period";

const PRESETS: Period[] = [null, { days: 7 }, { days: 30 }];
const row =
  "flex h-9 w-full cursor-pointer items-center justify-between gap-3 px-3.5 text-left text-[14px] text-nav hover:bg-bg5 focus-visible:bg-bg5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

// Up / Down / Home / End move between the menu's items (Tab closes it, back on the button: Popover).
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  items[(to + items.length) % items.length]?.focus();
}

/** The dashboard's period: a menu of presets, and a dialog for a custom range of days (Apply / Cancel). */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [problem, setProblem] = useState<ReturnType<typeof rangeProblem>>(null);
  const today = todayIST();
  const isCustom = value !== null && "from" in value;
  const pick = (p: Period) => {
    setMenu(false);
    if (!samePeriod(p, value)) onChange(p); // the same period again: nothing to fetch
  };
  const openCustom = () => {
    setMenu(false);
    setFrom(isCustom ? value.from : "");
    setTo(isCustom ? value.to : "");
    setProblem(null);
    setCustom(true);
  };
  const apply = () => {
    const wrong = rangeProblem(from, to, today);
    if (wrong) return setProblem(wrong);
    setCustom(false);
    pick({ from, to });
  };
  const item = (label: string, on: boolean, onClick: () => void) => (
    <button suppressHydrationWarning key={label} type="button" role="menuitemradio" aria-checked={on} data-autofocus={on || undefined} onClick={onClick} className={`${row} ${on ? "font-semibold text-selected" : ""}`}>
      {label}
      {on && <Icon name="mark" size={16} className="shrink-0 text-selected" />}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-medium text-nav opacity-80">Leads created</span>
      <ToolButton label={periodLabel(value)} icon="calendar" btnRef={button} onClick={() => setMenu((m) => !m)} />
      <Popover anchor={button} open={menu} onClose={() => setMenu(false)} align="end">
        <div role="menu" aria-label="Leads created" onKeyDown={moveFocus} className="flex w-[200px] flex-col">
          {PRESETS.map((p) => item(periodLabel(p), samePeriod(p, value), () => pick(p)))}
          {item("Custom range…", isCustom, openCustom)}
        </div>
      </Popover>
      <Modal open={custom} onClose={() => setCustom(false)} title="Custom date range" className="w-[460px] gap-4!">
        <p className="text-[13px] text-nav">The lead figures cover the leads created from the start date to the end date, both included.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" required error={problem?.field === "from" ? problem.message : undefined}>
            <DateField
              value={from}
              max={to || today}
              invalid={problem?.field === "from"}
              onChange={(v) => {
                setFrom(v);
                setProblem(null);
              }}
            />
          </Field>
          <Field label="End date" required error={problem?.field === "to" ? problem.message : undefined}>
            <DateField
              value={to}
              min={from || undefined}
              max={today}
              invalid={problem?.field === "to"}
              onChange={(v) => {
                setTo(v);
                setProblem(null);
              }}
            />
          </Field>
        </div>
        <ModalActions onCancel={() => setCustom(false)} onDone={apply} doneLabel="Apply" />
      </Modal>
    </div>
  );
}
