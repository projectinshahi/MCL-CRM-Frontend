"use client";

import { useState } from "react";
import { useRemove, useToast } from "@/components/feedback";
import { Loading, Skeleton } from "@/components/skeletons";
import { Field, IconButton, LoadFailed, Modal, ModalActions, PrimaryButton, TextInput } from "@/components/ui";
import { SectionHeader, UnderlineTabs } from "@/components/users/SectionHeader";
import { api, fieldErrors, useApi } from "@/lib/api";

const TABS = [
  { label: "Lead Sources", href: "/settings", cls: "px-4" },
  { label: "Lead Status", href: "/settings/lead-status", cls: "px-4" },
];

type Item = { id: string; name: string; active?: boolean };

// Figma 1:6650 (Lead Sources) / 1:6678 (Lead Status). "+ Add" → Add New Source 1:7711 / Add New Lead Status 1:7731.
// The pencil opens the same dialog to rename an entry (leads keep it: they hold its id).
export function SettingsList({ tab, endpoint, modalTitle, fieldLabel, editTitle, editLabel, noun }: {
  tab: number;
  endpoint: string;
  modalTitle: string;
  fieldLabel: string;
  editTitle: string;
  editLabel: string;
  noun: string;
}) {
  const list = useApi<Item[]>(endpoint);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null); // null: adding
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { remove, removing } = useRemove(list.reload);

  // A source still used by leads is deactivated rather than deleted, so it drops out of this list.
  const items = (list.data ?? []).filter((x) => x.active !== false);
  const close = () => setOpen(false);
  const start = (item: Item | null) => {
    setEditing(item);
    setName(item?.name ?? "");
    setError("");
    setOpen(true);
  };
  const what = noun.toLowerCase();
  const done = async () => {
    if (saving) return;
    if (!name.trim()) return setError("Enter a name");
    if (editing && name.trim() === editing.name) return close();
    setSaving(true);
    try {
      const saved = await api<Item>(editing ? `${endpoint}/${editing.id}` : endpoint, { method: editing ? "PATCH" : "POST", body: { name } });
      close();
      if (editing) {
        toast.success(`${noun} updated`, `“${editing.name}” is now “${saved.name}”.`);
        list.mutate((xs) => xs.map((x) => (x.id === saved.id ? { ...x, name: saved.name } : x)));
      } else {
        toast.success(`${noun} added`, `“${saved.name}” is now available.`);
        list.reload();
      }
    } catch (err) {
      const field = fieldErrors(err).name;
      if (field) setError(field === "Already exists" ? `A ${what} with this name already exists` : field);
      else toast.apiError(err, editing ? `Couldn't rename the ${what}` : `Couldn't add the ${what}`);
    } finally {
      setSaving(false);
    }
  };
  const del = (item: Item) =>
    remove(item.id, {
      path: `${endpoint}/${item.id}`,
      title: `Remove ${noun.toLowerCase()}?`,
      message: (
        <>
          <b className="text-black">{item.name}</b> will no longer be offered for new leads. Leads that already use it keep it.
        </>
      ),
      confirmLabel: "Remove",
      success: `${noun} removed`,
      successDetail: `“${item.name}” was removed.`,
      failTitle: `Couldn't remove the ${noun.toLowerCase()}`,
    });

  return (
    <div className="flex flex-col items-end gap-4 p-4 sm:p-6">
      <div className="flex w-full flex-col gap-4">
        <SectionHeader title="Settings" subtitle="Configure Your CRM Workspace" />
        <UnderlineTabs tabs={TABS} active={tab} />
      </div>

      <ul className="flex w-full flex-col rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5">
        {!list.data && !list.error && (
          <li>
            <Loading>
              {[45, 30, 55, 38].map((w) => (
                <div key={w} className="flex items-center justify-between gap-3 border-b border-stroke2 py-3 last:border-b-0">
                  <Skeleton className="size-2 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4" style={{ width: `${w}%` }} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Skeleton className="size-8 rounded-[10px]" />
                    <Skeleton className="size-8 rounded-[10px]" />
                  </div>
                </div>
              ))}
            </Loading>
          </li>
        )}
        {!list.data && list.error && (
          <li>
            <LoadFailed what="list" onRetry={list.reload} />
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 border-b border-stroke2 py-3 last:border-b-0">
            <span className="size-2 shrink-0 rounded-full bg-nav/50" />
            <p className="min-w-0 flex-1 text-[15px] font-medium break-words text-nav">{item.name}</p>
            <div className="flex shrink-0 gap-1">
              <IconButton icon="edit" label={`Edit ${item.name}`} onClick={() => start(item)} />
              <IconButton icon="delete" label={`Delete ${item.name}`} onClick={() => del(item)} disabled={removing === item.id} />
            </div>
          </li>
        ))}
      </ul>

      <PrimaryButton onClick={() => start(null)}>Add</PrimaryButton>

      <Modal open={open} onClose={close} title={editing ? editTitle : modalTitle} className="w-[480px] gap-4!">
        <Field label={editing ? editLabel : fieldLabel} error={error} required>
          <TextInput
            aria-required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && done()}
            aria-invalid={!!error}
            autoFocus
          />
        </Field>
        <div>
          <ModalActions onCancel={close} onDone={done} pending={saving} pendingLabel={editing ? "Saving…" : "Adding…"} />
        </div>
      </Modal>
    </div>
  );
}
