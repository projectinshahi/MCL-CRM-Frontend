"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import { FieldError, Popover } from "@/components/ui";
import {
  callingCodeOf, countryName, countryOf, flag, formatTyping, fromInternational, nationalDigits,
  phoneError, phonePlaceholder, searchCountries, splitPhone, tidy, toE164, type CountryCode,
} from "@/lib/phone";

/**
 * International phone field: searchable country picker + number formatted as you type.
 * Submits E.164 (through a hidden input when `name` is given, and/or `onChange`). Until the user edits it,
 * the saved `defaultValue` is submitted exactly as it was, so opening and saving a form never rewrites it.
 * Label it with <Field htmlFor={id}> (or UField); messages and hints are rendered here, tied to the input.
 */
export function PhoneInput({ id, name, defaultValue, onChange, error }: {
  id: string;
  name?: string;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  error?: string; // from the form or the API
}) {
  const [initial] = useState(() => splitPhone(defaultValue));
  const [country, setCountry] = useState(initial.country);
  const [text, setText] = useState(initial.text);
  const [touched, setTouched] = useState(false);
  const [checked, setChecked] = useState<string>(); // message found when the user left the field
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const international = text.trim().startsWith("+");
  const shown = international ? countryOf(text) : country; // "+…" text names its own country
  const value = touched ? toE164(text, country) : (defaultValue ?? "");
  const message = error ?? checked;
  const hint = initial.unverified && !touched;

  const update = (nextText: string, nextCountry = country) => {
    setText(nextText);
    setCountry(nextCountry);
    setTouched(true);
    setChecked(undefined); // no error on every keystroke; checked again on leaving the field
    onChange?.(toE164(nextText, nextCountry));
  };

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const kind = (e.nativeEvent as InputEvent).inputType ?? "";
    if (kind === "insertText" || kind.startsWith("delete") || kind === "insertCompositionText") {
      // Format while typing at the end; deleting or editing mid-number leaves the caret alone (tidied on leaving).
      update(kind === "insertText" && e.target.selectionStart === raw.length ? formatTyping(raw, country) : raw);
      return;
    }
    // Paste, drop, autofill: "+44 (0)20 7031-3000", "0044…", "tel:+1…" go to their own country.
    const moved = fromInternational(raw, country);
    if (moved) update(moved.text, moved.country);
    else update(formatTyping(raw, country));
  };

  const leave = () => {
    if (!touched) return;
    const moved = fromInternational(text, country);
    const nextCountry = moved ? moved.country : country;
    const nextText = moved ? moved.text : tidy(text, country);
    if (nextText !== text || nextCountry !== country) update(nextText, nextCountry);
    setChecked(phoneError(toE164(nextText, nextCountry)));
  };

  // A new country keeps the digits typed so far and replaces only the calling code.
  const pick = (c: CountryCode) => {
    setOpen(false);
    const digits = nationalDigits(text);
    update(digits ? formatTyping(digits, c) : "", c);
    requestAnimationFrame(() => input.current?.focus());
  };

  const describedBy = [message && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  const buttonLabel = international
    ? `Country: ${shown ? countryName(shown) : "from the number's code"}. Change country`
    : country
      ? `Country: ${countryName(country)}, +${callingCodeOf(country)}. Change country`
      : "Select a country";

  return (
    <>
      <div ref={wrap} data-invalid={message ? true : undefined} className="flex min-h-10 w-full min-w-0 items-stretch overflow-hidden rounded-[12px] border border-stroke2 bg-bg5 transition-[border-color,box-shadow] duration-200 focus-within:border-stroke focus-within:shadow-[0_0_0_3px_rgb(71_215_251/0.25)] data-invalid:border-danger data-invalid:focus-within:shadow-[0_0_0_3px_rgb(249_74_74/0.18)]">
        <button
          suppressHydrationWarning
          ref={button}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={buttonLabel}
          onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-stroke2 pr-2.5 pl-3 text-[14px] font-medium text-black outline-none hover:bg-[rgb(71_215_251/0.12)] focus-visible:bg-[rgb(71_215_251/0.2)]"
        >
          <span aria-hidden className="text-[18px] leading-none">{shown ? flag(shown) : "🌐"}</span>
          {!international && country && <span className="tabular-nums">+{callingCodeOf(country)}</span>}
          <span className={`flex transition-transform ${open ? "rotate-180" : ""}`}>
            <Icon name="arrow-right" size={14} className="rotate-90 text-nav" />
          </span>
        </button>
        <input
          suppressHydrationWarning
          ref={input}
          id={id}
          data-name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={text}
          onChange={change}
          onBlur={leave}
          placeholder={phonePlaceholder(international ? undefined : country)}
          aria-invalid={!!message}
          aria-describedby={describedBy}
          className="w-full min-w-0 bg-transparent px-3.5 py-[9px] text-[14px] leading-5 font-medium text-black outline-none placeholder:text-black/50"
        />
      </div>
      {name && <input type="hidden" name={name} value={value} />}
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] text-nav">
          This saved number couldn&apos;t be verified. It stays as it is unless you change it.
        </p>
      )}
      <FieldError id={`${id}-error`} message={message} />
      <Popover anchor={wrap} open={open} onClose={() => setOpen(false)} fit>
        <CountryPicker
          selected={shown ?? country}
          onPick={pick}
          onDismiss={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      </Popover>
    </>
  );
}

/** Combobox: type to filter (name, ISO code or calling code), arrows to move, Enter to choose, Esc/Tab to close. */
function CountryPicker({ selected, onPick, onDismiss }: { selected?: CountryCode; onPick: (c: CountryCode) => void; onDismiss: () => void }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchCountries(query), [query]);
  const [active, setActive] = useState(() => Math.max(0, results.findIndex((c) => c.code === selected)));

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, active]);

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[e.key];
    if (move) {
      e.preventDefault();
      setActive((a) => Math.min(Math.max(a + move, 0), Math.max(results.length - 1, 0)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) onPick(results[active].code);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation(); // closes only the picker, not the dialog behind it
      onDismiss();
    }
  };

  return (
    <div className="flex w-full flex-col">
      <div className="border-b border-stroke2 p-2">
        <input
          suppressHydrationWarning
          data-autofocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          aria-label="Search countries by name or calling code"
          placeholder="Search country or code"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={key}
          className="h-9 w-full rounded-[10px] border border-stroke2 bg-bg5 px-3 text-[14px] font-medium text-black outline-none placeholder:text-black/50 focus:border-stroke"
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Countries" className="max-h-[min(288px,45dvh)] overflow-y-auto overscroll-contain py-1">
        {results.map((c, i) => (
          <li
            key={c.code}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => i !== active && setActive(i)}
            onClick={() => onPick(c.code)}
            className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[14px] text-nav ${i === active ? "bg-[rgb(71_215_251/0.2)]" : ""}`}
          >
            <span aria-hidden className="text-[18px] leading-none">{flag(c.code)}</span>
            <span className={`min-w-0 flex-1 truncate ${c.code === selected ? "font-semibold text-black" : ""}`}>{c.name}</span>
            <span className="text-black/60 tabular-nums">+{c.callingCode}</span>
          </li>
        ))}
        {!results.length && <li className="px-3.5 py-2.5 text-[13px] text-muted">No country matches “{query}”.</li>}
      </ul>
    </div>
  );
}
