"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useConfirm, useToast } from "@/components/feedback";
import { PhoneInput } from "@/components/PhoneInput";
import { SkeletonRows, SubtitleSkeleton } from "@/components/skeletons";
import { activeFilters, Badge, col, EmptyState, IconButton, LoadFailed, Modal, ModalActions, Pagination, Popover, PrimaryButton, SearchBox, SelectField, TextInput, ToolButton } from "@/components/ui";
import { api, cap, day, fieldErrors, paging, pastEnd, useApi, useDebounced, type List } from "@/lib/api";
import { phoneError } from "@/lib/phone";
import { useMe } from "@/components/Shell";
import { UField, USER_MODAL, WIDE_ACTIONS } from "./form";
import { SectionHeader, UnderlineTabs } from "./SectionHeader";

export const USER_TABS = [
  { label: "User", href: "/users", cls: "w-[100px] px-[10px]" },
  { label: "Role", href: "/users/roles", cls: "w-[90px] px-[10px]" },
];

type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "active" | "inactive";
  role: { id: string; name: string };
  assignedLeads: number;
  convertedLeads: number;
  createdAt: string;
};
export type RoleSummary = { id: string; name: string; permissions: string[]; userCount: number; members: { initials: string }[]; extraMembers: number };

// Figma 1:6530 columns at 14px text (sum 960 = table min-width); they grow proportionally on wider screens.
const HEAD: [string, number, string?][] = [
  ["Name", 170], ["Role", 120], ["EMail", 200], ["Status", 90], ["Assigned Leads", 110, "text-center"], ["Converted", 90, "text-center"],
  ["Created", 100, "text-center"], ["Actions", 80, "text-center"],
];
const cell = "text-[14px] font-medium break-words text-black";

type Draft = { name: string; email: string; phone: string; role: string; password: string };
const EMPTY: Draft = { name: "", email: "", phone: "", role: "", password: "" };
type Filter = { roleId?: string; status?: User["status"] };

export function UsersPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [roleMenu, setRoleMenu] = useState(false);
  const filterRef = useRef<HTMLButtonElement>(null);
  // editing: null = closed, "" = Create New User (1:7919), id = Edit User (1:7950)
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({}); // keyed by API field: name, email, phone, roleId, password
  const [savedPhone, setSavedPhone] = useState(""); // the edited user's phone as stored
  const phoneId = useId();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const roles = useApi<RoleSummary[]>("/roles").data ?? [];
  // A new search starts again at page 1 when it is sent: resetting on the first key fetched page 1 of the old search.
  const q = useDebounced(query);
  const [searched, setSearched] = useState(q);
  if (searched !== q) {
    setSearched(q);
    setPage(1);
  }
  const users = useApi<List<User>>("/users", { q, roleId: filter.roleId, status: filter.status, page });
  const list = users.data;
  const back = pastEnd(list, page); // the last user on the last page was removed
  if (back) setPage(back);
  const filtered = !!(query.trim() || filter.roleId || filter.status);

  const open = (u?: User) => {
    setDraft(u ? { name: u.name, email: u.email, phone: u.phone ?? "", role: u.role.name, password: "" } : EMPTY);
    setSavedPhone(u?.phone ?? "");
    setErrors({});
    setEditing(u ? u.id : "");
  };
  // Closing (×, Cancel, Escape, outside click) never saves, and never keeps a typed password around.
  const close = () => {
    setEditing(null);
    setDraft((d) => ({ ...d, password: "" }));
  };

  // Checked here first so obvious mistakes show instantly; the server still validates everything.
  const validate = (roleId?: string) => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = "Enter the user's name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) e.email = "Enter a valid email address";
    if (!roleId) e.roleId = "Select a role";
    const phone = draft.phone !== savedPhone && phoneError(draft.phone); // an untouched saved number is not re-checked
    if (phone) e.phone = phone;
    // Required on create; on edit only checked when a new one is typed (blank keeps the current password).
    if (!editing || draft.password) {
      if (draft.password.length < 8) e.password = "Use at least 8 characters";
      else if (draft.password.length > 128) e.password = "Use at most 128 characters";
    }
    return e;
  };

  const save = async () => {
    if (saving) return; // a second click while the first save is in flight does nothing
    const roleId = roles.find((r) => r.name === draft.role)?.id;
    const local = validate(roleId);
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    // An untouched phone is left out, so a number saved in an older format is never rewritten by an unrelated edit.
    const body = { name: draft.name, email: draft.email, phone: draft.phone === savedPhone ? undefined : draft.phone, roleId };
    try {
      if (editing) {
        const newPassword = draft.password; // sent only when typed: a blank field must not reset anything
        const u = await api<User>(`/users/${editing}`, { method: "PATCH", body: { ...body, ...(newPassword && { password: newPassword }) } });
        // Show the saved values straight away; lead counts are unchanged by an edit, so they are kept.
        users.mutate((l) => ({ ...l, items: l.items.map((x) => (x.id === u.id ? { ...x, ...u } : x)) }));
        toast.success(
          "User updated",
          !newPassword
            ? `${u.name}'s details were saved.`
            : u.id === me?.id
              ? "Your details and password were saved. Your other devices were signed out."
              : `${u.name}'s details and password were saved. They'll sign in again with the new password.`,
        );
      } else {
        const u = await api<User>("/users", { method: "POST", body: { ...body, password: draft.password } });
        if (filtered) users.reload(); // the new user may or may not match the current search
        else
          // Newest users sort last: add it to this page when this is the last page, and count it either way.
          users.mutate((l) => ({
            ...l,
            total: l.total + 1,
            items: l.page * l.pageSize >= l.total && l.items.length < l.pageSize ? [...l.items, u] : l.items,
          }));
        toast.success("User created", `${u.name} can now sign in with the password you set.`);
      }
      close();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields.email === "Already in use" ? { ...fields, email: "A user with this email already exists" } : fields); // shown under the matching fields; typed values are kept
      else toast.apiError(err, editing ? "Couldn't update the user" : "Couldn't create the user");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: User) => {
    const ok = await confirm({
      title: "Remove user?",
      message: (
        <>
          <b className="text-black">{u.name}</b> will lose access immediately. Their history is kept: the account is deactivated, or deleted if it has none.
        </>
      ),
      confirmLabel: "Remove user",
      danger: true,
    });
    if (!ok) return;
    setDeleting(u.id);
    try {
      await api(`/users/${u.id}`, { method: "DELETE" });
      toast.success("User removed", `${u.name} can no longer sign in.`);
      users.reload(); // the account is either gone or now inactive; the server decides which
    } catch (err) {
      toast.apiError(err, "Couldn't remove the user");
    } finally {
      setDeleting(null);
    }
  };
  const pick = (f: Filter) => {
    // Picking the active option again clears it.
    setFilter((cur) => (f.roleId ? { ...cur, roleId: cur.roleId === f.roleId ? undefined : f.roleId } : { ...cur, status: cur.status === f.status ? undefined : f.status }));
    setPage(1);
    setFilterOpen(false);
  };
  const me = useMe();
  const passwordId = useId();
  const set = (k: keyof Draft) => (v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k === "role" ? "roleId" : k]: "" })); // the message goes once the field is edited
  };
  const passwordField = (
    <UField label={editing ? "New Password" : "Password"} htmlFor={passwordId} error={errors.password} required={!editing}>
      <PasswordInput
        id={passwordId}
        value={draft.password}
        onChange={set("password")}
        placeholder={editing ? "Leave blank to keep the current password" : "At least 8 characters"}
        invalid={!!errors.password}
        required={!editing}
      />
    </UField>
  );

  const option = "flex min-h-9 w-full cursor-pointer items-center justify-between border-b-[0.5px] border-stroke2 px-3.5 py-2 text-left text-[14px] text-nav";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Add User (1:6509) → OVERLAY Create New User 1:7919, instant */}
      <SectionHeader title="User Management" subtitle={list ? `${list.total} Users` : !users.error && <SubtitleSkeleton />} action={<PrimaryButton onClick={() => open()}>Add User</PrimaryButton>} />
      <UnderlineTabs tabs={USER_TABS} active={0} />

      <section className="flex min-w-0 flex-col rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 py-4">
          <h2 className="text-[18px] font-semibold tracking-[-0.36px] text-black">Users</h2>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <SearchBox
              value={query}
              onChange={setQuery}
            />
            <ToolButton label="Filter" icon="filter" btnRef={filterRef} count={activeFilters(filter)} onClick={() => setFilterOpen(true)} />
          </div>
        </div>

        <div className="table-scroll">
          <div className="flex min-w-[960px] flex-col">
            <div className="flex items-center border-b border-stroke2 py-3 text-[13px] font-medium text-nav/80">
              {HEAD.map(([label, w, align], i) => (
                <p key={label} className={`${align ?? ""} ${i === 0 ? "sticky left-0 z-[1] bg-primary" : ""}`} style={col(w)}>
                  {label}
                </p>
              ))}
            </div>
            {!list ? (
              users.error ? <LoadFailed what="users" onRetry={users.reload} /> : <SkeletonRows columns={HEAD.map(([, w]) => w)} grow />
            ) : list.items.length === 0 && list.page === page ? (
              <EmptyState>{filtered ? "No users match your search or filters." : "No users yet. Use Add User to create the first one."}</EmptyState>
            ) : null}
            {list?.items.map((u) => (
              <div key={u.id} className="flex items-center border-b border-stroke2 py-2.5">
                <p className={`${cell} sticky left-0 z-[1] flex items-center self-stretch bg-primary pr-3`} style={col(170)}>{u.name}</p>
                <p className={`${cell} pr-3`} style={col(120)}>{u.role.name}</p>
                <p className={`${cell} truncate pr-3`} style={col(200)} title={u.email}>{u.email}</p>
                <div style={col(90)}>
                  <Badge label={cap(u.status)} width={70} />
                </div>
                <p className={`${cell} text-center`} style={col(110)}>{u.assignedLeads}</p>
                <p className={`${cell} text-center`} style={col(90)}>{u.convertedLeads}</p>
                <p className={`${cell} text-center`} style={col(100)}>{day(u.createdAt)}</p>
                <div className="flex items-center justify-center gap-1" style={col(80)}>
                  {/* Edit (1:6551) → OVERLAY Edit User 1:7950, instant */}
                  <IconButton icon="edit" label={`Edit ${u.name}`} onClick={() => open(u)} />
                  <IconButton icon="delete" label={`Delete ${u.name}`} onClick={() => remove(u)} disabled={deleting === u.id} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <Pagination {...paging(list, "Users", setPage)} />
      </section>

      {/* Filter → dropdown 1:7981 (MANUAL, 25% backdrop, close on outside click) */}
      <Popover anchor={filterRef} open={filterOpen} onClose={() => setFilterOpen(false)} dx={-38} dy={46}>
        <div className="w-[180px] overflow-hidden rounded-[12px] border border-stroke2 bg-primary shadow-[0_8px_24px_rgb(21_46_175/0.12)]">
          <button suppressHydrationWarning type="button" aria-expanded={roleMenu} onClick={() => setRoleMenu((o) => !o)} className={option}>
            Role
            <Icon name="arrow-right" size={16} className={`text-nav transition-transform ${roleMenu ? "-rotate-90" : "rotate-90"}`} />
          </button>
          {roleMenu &&
            roles.map((r) => (
              <button suppressHydrationWarning key={r.id} type="button" onClick={() => pick({ roleId: r.id })} className={`${option} pl-7 ${filter.roleId === r.id ? "bg-bg5" : ""}`}>
                {r.name}
              </button>
            ))}
          {(["active", "inactive"] as const).map((s) => (
            <button suppressHydrationWarning key={s} type="button" onClick={() => pick({ status: s })} className={`${option} last:border-b-0 ${filter.status === s ? "bg-bg5" : ""}`}>
              {cap(s)}
            </button>
          ))}
        </div>
      </Popover>

      <Modal open={editing !== null} onClose={close} title={editing ? "Edit User" : "Create New User"} className={`w-[600px] ${USER_MODAL}`}>
        <UField label="User Name" error={errors.name} required>
          <TextInput value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="eg., Praveen" aria-invalid={!!errors.name} aria-required />
        </UField>
        <UField label="Email ID" error={errors.email} required>
          <TextInput type="email" value={draft.email} onChange={(e) => set("email")(e.target.value)} placeholder="eg., afasfg@gmail.com" aria-invalid={!!errors.email} aria-required />
        </UField>
        <UField label="Phone" htmlFor={phoneId}>
          <PhoneInput id={phoneId} defaultValue={draft.phone} onChange={set("phone")} error={errors.phone || undefined} />
        </UField>
        {editing && passwordField}
        <UField label="Roles" error={errors.roleId} required>
          <SelectField value={draft.role} options={roles.map((r) => r.name)} onChange={set("role")} placeholder="Admin" invalid={!!errors.roleId} />
        </UField>
        {/* Business decision: the admin sets the first password here; no invite email. */}
        {!editing && passwordField}
        <div className={WIDE_ACTIONS}>
          <ModalActions onCancel={close} onDone={save} pending={saving} pendingLabel={editing ? "Saving…" : "Creating…"} />
        </div>
      </Modal>
    </div>
  );
}

function PasswordInput({ id, value, onChange, placeholder, invalid, required }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; invalid: boolean; required: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput
        id={id}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-required={required || undefined}
        className="pr-11!"
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
  );
}
