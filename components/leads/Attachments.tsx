"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/feedback";
import { IconButton, Spinner } from "@/components/ui";
import { day, download } from "@/lib/api";
import { ACCEPT, fileKey, formatBytes, MAX_FILE_BYTES, MAX_FILES, precheck, prepare, type Picked } from "@/lib/attachments";

export type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  originalSizeBytes: number | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string }; // customer files say who added them
};

const row = "flex items-center gap-2.5 rounded-[12px] border border-stroke2 bg-bg5 px-3 py-2";

/**
 * Files chosen for a new lead (Figma "Attach Files" box): click or drop to add, see each file's size (and what
 * compression saved), remove any before saving. Photos are compressed here; nothing is uploaded until Done.
 */
export function AttachmentPicker({ id, items, setItems, disabled }: { id: string; items: Picked[]; setItems: Dispatch<SetStateAction<Picked[]>>; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string>();
  // The list as of the last addition: two drops (or picks) in quick succession must see each other's files.
  const current = useRef(items);
  useEffect(() => {
    current.current = items;
  }, [items]);

  const add = (list: FileList | null) => {
    if (!list?.length || disabled) return;
    const known = new Set(current.current.map((i) => i.key));
    const fresh = [...list].filter((f) => !known.has(fileKey(f)));
    const room = Math.max(MAX_FILES - current.current.length, 0);
    const notes = [];
    if (fresh.length < list.length) notes.push("Files already in the list were skipped.");
    if (fresh.length > room) notes.push(`A lead can have up to ${MAX_FILES} files here; ${fresh.length - room} not added.`);
    setNote(notes.join(" ") || undefined);
    const added: Picked[] = fresh.slice(0, room).map((file) => {
      const error = precheck(file);
      return { key: fileKey(file), file, originalSize: null, error, preparing: !error };
    });
    current.current = [...current.current, ...added];
    setItems((cur) => [...cur, ...added]);
    for (const p of added.filter((a) => a.preparing))
      prepare(p.file).then((ready) => setItems((cur) => cur.map((i) => (i.key === p.key ? { key: p.key, ...ready } : i))));
  };

  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        data-over={over || undefined}
        className={`flex flex-col items-center gap-1.5 rounded-[12px] border border-dashed border-nav/30 bg-bg5 px-5 py-5 text-center text-[14px] font-medium text-black transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus data-over:border-button data-over:bg-[rgb(71_215_251/0.12)] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-button"}`}
      >
        <input
          suppressHydrationWarning
          id={id}
          name="attachments"
          type="file"
          multiple
          accept={ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = ""; // so the same file can be chosen again after removing it
          }}
        />
        <span>
          Drop files here or <span className="text-link underline">browse</span>
        </span>
        <span className="text-[12px] font-normal text-nav">
          PDF, Word, Excel, JPG, PNG, WEBP or HEIC · up to {MAX_FILES} files, {MAX_FILE_BYTES / 1024 / 1024} MB each
        </span>
        <Icon name="add-circle" size={20} className="text-nav" />
      </label>
      {note && (
        <p role="status" className="text-[13px] text-nav">
          {note}
        </p>
      )}
      {items.length > 0 && (
        <ul aria-label="Files to attach" className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.key} data-error={i.error ? true : undefined} className={`${row} data-error:border-danger`}>
              <Icon name="note" size={18} className="shrink-0 text-nav" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-medium text-black" title={i.file.name}>
                  {i.file.name}
                </span>
                <span className={`text-[12px] ${i.error ? "text-danger" : "text-nav"}`}>
                  {i.error ??
                    (i.preparing ? "Compressing…" : i.originalSize ? `${formatBytes(i.originalSize)} → ${formatBytes(i.file.size)}, compressed` : formatBytes(i.file.size))}
                </span>
              </div>
              {i.preparing && <Spinner className="text-nav" />}
              {!disabled && (
                <IconButton
                  icon="delete"
                  label={`Remove ${i.file.name}`}
                  onClick={() => {
                    current.current = current.current.filter((x) => x.key !== i.key);
                    setItems((cur) => cur.filter((x) => x.key !== i.key));
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Saved files of a lead or customer (`base` = "/leads/<id>" or "/customers/<id>"), each downloadable through the
 * API (which checks access) under its original name. With `onRemove`, each also gets a Remove button.
 */
export function AttachmentList({ base, items, onRemove, removing }: { base: string; items: Attachment[]; onRemove?: (a: Attachment) => void; removing?: string | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return <p className="text-[14px] text-nav opacity-70">No files attached.</p>;
  return (
    <ul aria-label="Attached files" className="flex flex-col gap-2">
      {items.map((a) => (
        <li key={a.id} className={row}>
          <Icon name="note" size={18} className="shrink-0 text-nav" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-medium text-black" title={a.fileName}>
              {a.fileName}
            </span>
            <span className="text-[12px] text-nav">
              {formatBytes(a.sizeBytes)}
              {a.originalSizeBytes ? ` (compressed from ${formatBytes(a.originalSizeBytes)})` : ""} · {day(a.createdAt)}
              {a.uploadedBy && ` · ${a.uploadedBy.name}`}
            </span>
          </div>
          <IconButton
            icon="download"
            label={`Download ${a.fileName}`}
            disabled={busy === a.id}
            onClick={async () => {
              setBusy(a.id);
              try {
                await download(`${base}/attachments/${a.id}`, a.fileName);
              } catch (err) {
                toast.apiError(err, `Couldn't download “${a.fileName}”`);
              } finally {
                setBusy(null);
              }
            }}
          />
          {onRemove && <IconButton icon="delete" label={`Remove ${a.fileName}`} onClick={() => onRemove(a)} disabled={removing === a.id} />}
        </li>
      ))}
    </ul>
  );
}
