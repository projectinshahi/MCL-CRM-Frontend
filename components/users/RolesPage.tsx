"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useConfirm, useToast } from "@/components/feedback";
import { Skeleton, SkeletonCards, SubtitleSkeleton } from "@/components/skeletons";
import { LoadFailed, Modal, ModalActions, PrimaryButton, Spinner, TextInput } from "@/components/ui";
import { api, fieldErrors, useApi, type List } from "@/lib/api";
import { CaretInput, Chip, FieldLabel, PermissionPills, UField, USER_MODAL, WIDE_ACTIONS, toggle } from "./form";
import { inter, SectionHeader, UnderlineTabs } from "./SectionHeader";
import { USER_TABS, type RoleSummary as Role } from "./UsersPage";

type Permission = { code: string; label: string };
// Member avatar colours from the design, picked from the initials so a person keeps one colour.
const AVATAR = ["#676ff6", "#99a4b0", "#30a74e", "#e90000", "#00bdd7"];
const avatar = (initials: string) => AVATAR[[...initials].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR.length];

const noScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function RoleCard({ role, label, onEdit, onDelete, deleting }: { role: Role; label: (code: string) => string; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-stroke2 bg-primary p-5">
      <h2 className="border-b border-stroke2 pb-3 text-[18px] font-semibold tracking-[-0.36px] text-black">{role.name}</h2>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          {[["Permissions", role.permissions.length], ["Users", role.userCount]].map(([title, n]) => (
            <div key={title} className="flex w-[105px] flex-col gap-1">
              <p className="text-[13px] font-medium whitespace-nowrap text-nav">{title}</p>
              <p className={`${inter.className} text-[28px] leading-[round(1.21em,1px)] font-semibold text-selected opacity-80`}>{n}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-nav">Permissions</p>
          {/* Figma: fixed-width row with overflow scroll, so the chips are clipped at the card edge */}
          <div className={`flex gap-2 overflow-x-auto ${noScrollbar}`}>
            {role.permissions.map((p) => (
              <Chip key={p} label={label(p)} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-nav opacity-70">Assigned Users</p>
          <div className="flex min-h-7 items-center gap-2">
            <div className="flex items-center gap-1.5">
              {role.members.map((m, i) => (
                <span key={i} className="flex size-7 items-center justify-center rounded-full" style={{ background: avatar(m.initials) }}>
                  <span className="text-[11px] font-semibold text-white">{m.initials}</span>
                </span>
              ))}
            </div>
            {role.extraMembers > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#787878] px-1">
                <span className="text-[11px] font-semibold text-white">+{role.extraMembers}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit → Edit Role overlay (1:7806); Delete → API (refused while users still hold the role) */}
          <button suppressHydrationWarning type="button" onClick={onEdit} className="flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-button bg-primary px-4 text-[14px] font-medium text-link transition-colors hover:bg-bg5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <Icon name="edit" size={16} />
            Edit
          </button>
          <button suppressHydrationWarning type="button" onClick={onDelete}
            disabled={deleting}
            aria-busy={deleting || undefined}
            className="flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-button px-4 text-[14px] font-medium text-white transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {deleting ? <Spinner /> : <Icon name="delete" size={16} />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </article>
  );
}

type Draft = { name: string; permissions: string[] };

export function RolesPage() {
  const roles = useApi<Role[]>("/roles");
  const permissions = useApi<Permission[]>("/permissions").data ?? [];
  const users = useApi<List<unknown>>("/users", { pageSize: 1 });
  const userTotal = users.data?.total;
  const label = (code: string) => permissions.find((p) => p.code === code)?.label ?? code;
  // Chips follow the catalogue (sidebar) order, whatever order they were ticked in.
  const inOrder = (codes: string[]) => [...codes].sort((a, b) => permissions.findIndex((p) => p.code === a) - permissions.findIndex((p) => p.code === b));
  // Create New Role (1:7850)
  const [creating, setCreating] = useState(false);
  // Edit Role (1:7806) ⇄ Permissions (1:7891)
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", permissions: [] });
  const [beforePick, setBeforePick] = useState<string[]>([]);
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const setName = (name: string) => {
    setDraft((d) => ({ ...d, name }));
    setNameError("");
  };
  const noPermissionsWarning = () =>
    toast.warning("This role has no permissions", "People with it can sign in but won't see any CRM pages until you add some.");

  /** Shared by create and edit: one request at a time, inline name errors, toast for everything else. */
  const submit = async (call: () => Promise<Role>, onSaved: (r: Role) => void, failTitle: string) => {
    if (saving) return;
    if (!draft.name.trim()) return setNameError("Enter a role name");
    setSaving(true);
    try {
      const r = await call();
      onSaved(r);
      if (r.permissions.length === 0) noPermissionsWarning();
    } catch (err) {
      const fields = fieldErrors(err);
      if (fields.name) setNameError(fields.name === "Already in use" ? "A role with this name already exists" : fields.name);
      else toast.apiError(err, failTitle);
    } finally {
      setSaving(false);
    }
  };
  const startCreate = () => {
    setDraft({ name: "", permissions: [] });
    setNameError("");
    setCreating(true);
  };
  const create = () =>
    submit(
      () => api<Role>("/roles", { method: "POST", body: { name: draft.name, permissions: draft.permissions } }),
      (r) => {
        roles.mutate((rs) => [...rs, r]); // shown instantly from the server's reply, no list refetch
        setCreating(false);
        toast.success("Role created", `“${r.name}” is ready to assign to users.`);
      },
      "Couldn't create the role",
    );
  const startEdit = (r: Role) => {
    setDraft({ name: r.name, permissions: r.permissions });
    setPicking(false);
    setNameError("");
    setEditing(r.id);
  };
  const saveEdit = () =>
    submit(
      () => api<Role>(`/roles/${editing}`, { method: "PATCH", body: { name: draft.name, permissions: draft.permissions } }),
      (r) => {
        roles.mutate((rs) => rs.map((x) => (x.id === r.id ? r : x)));
        setEditing(null);
        toast.success("Role updated", `Changes to “${r.name}” apply from each user's next action.`);
      },
      "Couldn't update the role",
    );
  const remove = async (r: Role) => {
    if (r.userCount > 0)
      // Blocked up front with the reason (the server refuses it too).
      return toast.warning("This role can't be deleted yet", `${r.userCount} user${r.userCount === 1 ? " still has" : "s still have"} “${r.name}”. Move them to another role first.`);
    const ok = await confirm({ title: "Delete role?", message: <>The role <b className="text-black">{r.name}</b> will be permanently deleted.</>, confirmLabel: "Delete role", danger: true });
    if (!ok) return;
    setDeleting(r.id);
    try {
      await api(`/roles/${r.id}`, { method: "DELETE" });
      roles.mutate((rs) => rs.filter((x) => x.id !== r.id));
      toast.success("Role deleted", `“${r.name}” was removed.`);
    } catch (err) {
      toast.apiError(err, "Couldn't delete the role");
    } finally {
      setDeleting(null);
    }
  };
  const openPicker = () => {
    setBeforePick(draft.permissions);
    setPicking(true);
  };
  const togglePerm = (p: string) => setDraft((d) => ({ ...d, permissions: toggle(d.permissions, p) }));

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Add Role (1:6729): prototype points at Create New User (1:7919), a wiring slip — the dedicated Create New Role overlay 1:7850 is used */}
      <SectionHeader title="User Management" subtitle={userTotal === undefined ? !users.error && <SubtitleSkeleton /> : `${userTotal} Users`} action={<PrimaryButton onClick={startCreate}>Add Role</PrimaryButton>} />
      {/* Figma 1:6730 sets these tabs in Inter Medium (1:6510 on the User tab uses Montserrat) */}
      <UnderlineTabs tabs={USER_TABS} active={1} className={inter.className} />

      {!roles.data && roles.error && <LoadFailed what="roles" onRetry={roles.reload} />}
      {!roles.data && !roles.error && (
        <div className="grid gap-4 lg:grid-cols-2 [&>div]:contents">
          <SkeletonCards rows={4} className="flex flex-col gap-4 rounded-[16px] border border-stroke2 bg-primary p-5">
            <Skeleton className="h-6 w-36" />
            <div className="flex justify-between">
              <Skeleton className="h-[52px] w-[105px]" />
              <Skeleton className="h-[52px] w-[105px]" />
            </div>
            <div className="flex gap-2">
              {[90, 70, 110].map((w) => <Skeleton key={w} className="h-6 rounded-full" style={{ width: w }} />)}
            </div>
            <Skeleton className="h-7 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1 rounded-[10px]" />
              <Skeleton className="h-9 flex-1 rounded-[10px]" />
            </div>
          </SkeletonCards>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.data?.map((r) => (
          <RoleCard key={r.id} role={r} label={label} onEdit={() => startEdit(r)} onDelete={() => remove(r)} deleting={deleting === r.id} />
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Create New Role" className={`w-[640px] ${USER_MODAL}`}>
        <UField label="Role Name" error={nameError} required>
          <CaretInput caret="right-3 text-nav">
            <TextInput value={draft.name} onChange={(e) => setName(e.target.value)} placeholder="eg., Admin" aria-invalid={!!nameError} aria-required className="pr-10!" />
          </CaretInput>
        </UField>
        <div className="flex flex-col gap-2">
          <FieldLabel>Permissions</FieldLabel>
          <PermissionPills options={permissions} value={draft.permissions} onToggle={togglePerm} />
        </div>
        <div className={`-mt-1 ${WIDE_ACTIONS}`}>
          <ModalActions onCancel={() => setCreating(false)} onDone={create} pending={saving} pendingLabel="Creating…" />
        </div>
      </Modal>

      {/* Edit Role and its Permissions picker share one overlay; "+" swaps to the picker, its Cancel/Done return. */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={picking ? "Permissions" : "Edit Role"}
        className={picking ? "w-[640px] gap-4! border-transparent! [&>button]:hidden [&>div:first-child]:hidden" : `w-[520px] gap-4! ${USER_MODAL}`}
      >
        {picking ? (
          <>
            <FieldLabel>Permissions</FieldLabel>
            <PermissionPills options={permissions} value={draft.permissions} onToggle={togglePerm} />
            <div className={WIDE_ACTIONS}>
              <ModalActions
                onCancel={() => {
                  setDraft((d) => ({ ...d, permissions: beforePick }));
                  setPicking(false);
                }}
                onDone={() => setPicking(false)}
              />
            </div>
          </>
        ) : (
          <>
            <UField label="Role Name" error={nameError} required>
              <CaretInput caret="right-3 text-nav">
                <TextInput value={draft.name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} aria-required className="pr-10! text-nav!" />
              </CaretInput>
            </UField>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Proof of Delivery</FieldLabel>
              <div className="flex items-center gap-4">
                <div className={`flex min-w-0 flex-1 gap-2 overflow-x-auto py-2.5 ${noScrollbar}`}>
                  {inOrder(draft.permissions).map((p) => (
                    <Chip key={p} label={label(p)}>
                      <button suppressHydrationWarning type="button" aria-label={`Remove ${p}`} onClick={() => togglePerm(p)} className="absolute -top-2 -right-1 cursor-pointer rounded-full bg-[#104b58] p-0.5 text-white">
                        <Icon name="close" size={12} />
                      </button>
                    </Chip>
                  ))}
                </div>
                <button suppressHydrationWarning type="button" aria-label="Add permissions" onClick={openPicker} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#104b58] bg-[#142e38] text-white">
                  <Icon name="close" size={16} className="rotate-45" />
                </button>
              </div>
            </div>
            <div className={WIDE_ACTIONS}>
              <ModalActions onCancel={() => setEditing(null)} onDone={saveEdit} pending={saving} />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
