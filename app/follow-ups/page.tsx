"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useRemove, useToast } from "@/components/feedback";
import { Skeleton, SkeletonCards, SkeletonRows, SubtitleSkeleton } from "@/components/skeletons";
import { Badge, EmptyState, FilterMenu, IconButton, LoadFailed, Modal, PageHeader, Pagination, Popover, PrimaryButton, SearchBox, ToolButton } from "@/components/ui";
import { HistoryItem } from "@/components/followups/HistoryItem";
import { NewFollowUpForm, TYPE_LABEL, type FollowUp } from "@/components/followups/NewFollowUpForm";
import { api, cap, day, paging, pastEnd, useApi, useDebounced, type List } from "@/lib/api";

const text = "shrink-0 text-[16px] font-medium text-black";
// Figma's one "Mark As Completed" item (1:7999), repeated for each action.
const menuItem =
  "flex w-full cursor-pointer items-center gap-[6px] border-b-[0.5px] border-stroke2 px-4 py-[10px] text-left text-[16px] tracking-[-0.32px] whitespace-nowrap text-nav last:border-b-0 hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";
const STATUS_FILTER = [{ key: "status", label: "Status", options: ["pending", "overdue", "completed"].map((s) => ({ value: s, label: cap(s) })) }];

type History = { lead: { id: string; label: string }; completedCount: number; entries: FollowUp[] };

export default function FollowUpsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const filterBtn = useRef<HTMLButtonElement>(null);
  const [filtering, setFiltering] = useState(false);
  const closeFilter = useCallback(() => setFiltering(false), []);
  const [historyPage, setHistoryPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<FollowUp | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const toast = useToast();
  const anchor = useRef<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setMenuFor(null), []);
  const closeModal = useCallback(() => setAdding(false), []);
  const closeEdit = useCallback(() => setEditing(null), []);
  const refresh = () => setVersion((v) => v + 1);
  const { remove, removing } = useRemove(refresh);

  // A new search starts again at page 1 when it is sent: resetting on the first key fetched page 1 of the old search.
  const q = useDebounced(query);
  const [searched, setSearched] = useState(q);
  if (searched !== q) {
    setSearched(q);
    setPage(1);
  }
  const list = useApi<List<FollowUp> & { pendingCount: number; overdueCount: number }>("/follow-ups", { q, status, page }, version);
  const back = pastEnd(list.data, page); // the last follow-up on the last page was deleted
  if (back) setPage(back);
  const history = useApi<List<History>>("/follow-ups/history", { page: historyPage, pageSize: 6 }, version);

  const markCompleted = async () => {
    const id = menuFor?.id;
    closeMenu();
    if (!id || completing) return;
    setCompleting(id);
    try {
      const done = await api<FollowUp>(`/follow-ups/${id}/complete`, { method: "POST" });
      toast.success("Follow-up completed", `“${done.note}” is marked as done.`);
      refresh();
    } catch (err) {
      toast.apiError(err, "Couldn't complete the follow-up");
    } finally {
      setCompleting(null);
    }
  };
  const del = (f: FollowUp) => {
    closeMenu();
    remove(f.id, {
      path: `/follow-ups/${f.id}`,
      title: "Delete follow-up?",
      message: (
        <>
          <b className="text-black">{f.note}</b> for {f.lead.label} will be deleted. The lead&apos;s activity keeps a note that it was removed.
        </>
      ),
      confirmLabel: "Delete",
      success: "Follow-up deleted",
      successDetail: `“${f.note}” was deleted.`,
      failTitle: "Couldn't delete the follow-up",
    });
  };
  const notYet = (what: string) => toast.info(`${what} isn't available yet`, "This will be added once its scope is agreed.");

  return (
    <div className="flex flex-col gap-[18px] p-4 sm:p-6">
      <PageHeader
        title="Follow - Up Centre"
        subtitle={list.data ? `${list.data.pendingCount} Pending · ${list.data.overdueCount} Overdue` : !list.error && <SubtitleSkeleton />}
        action={<PrimaryButton onClick={() => setAdding(true)}>Add Follow - Up</PrimaryButton>}
      />

      <section className="flex min-w-0 flex-col gap-[10px] rounded-[22px] border border-stroke2 bg-primary px-5">
        <div className="flex flex-wrap items-center justify-end gap-2 pt-6 pb-5">
          <SearchBox
            value={query}
            onChange={setQuery}
          />
          {/* Report: export scope not decided yet (report O1) */}
          <ToolButton label="Report" icon="download" onClick={() => notYet("Follow-up export")} />
          <ToolButton label="Filter" icon="filter" btnRef={filterBtn} onClick={() => setFiltering(true)} />
          <Popover anchor={filterBtn} open={filtering} onClose={closeFilter} dx={-38.2} dy={54}>
            <FilterMenu
              groups={STATUS_FILTER}
              value={{ status }}
              onPick={(_, value) => {
                setStatus(value);
                setPage(1);
                closeFilter();
              }}
            />
          </Popover>
        </div>

        <div className="overflow-x-auto">
          <div className="flex w-[1030px] flex-col gap-[10px]">
            <div className="flex items-start border-b border-stroke2 py-5 text-[16px] font-medium tracking-[-0.64px] text-nav *:shrink-0 *:opacity-80">
              <p className="w-[300px]">Note</p>
              <p className="w-[150px]">Type</p>
              <p className="w-[140px]">Assigned To</p>
              <p className="w-[120px]">Status</p>
              <p className="w-[120px] text-center">Due Date</p>
              <p className="w-[120px] text-center whitespace-break-spaces">{"Completed \nDate" /* Figma's trailing space shifts the centring */}</p>
              <p className="w-20 text-center">Actions</p>
            </div>

            {!list.data && !list.error && <SkeletonRows columns={[300, 150, 140, 120, 120, 120, 80]} twoLine />}
            {!list.data && list.error && <LoadFailed what="follow-ups" onRetry={list.reload} />}
            {list.data?.items.length === 0 && list.data.page === page && <EmptyState>{query || status ? "No follow-ups match your search or filter." : "No follow-ups yet. Use Add Follow - Up to schedule one."}</EmptyState>}
            {list.data?.items.map((f) => (
              <div key={f.id} className="flex items-center border-b border-stroke2 pt-[10px] pb-4">
                <div className="flex w-[300px] shrink-0 flex-col gap-1 font-medium">
                  <p className="text-[16px] tracking-[-0.64px] text-black">{f.note}</p>
                  <p className="text-[14px] tracking-[-0.56px] text-link">{f.lead.label}</p>
                </div>
                <p className={`${text} w-[150px] tracking-[-0.64px]`}>{TYPE_LABEL[f.type]}</p>
                <p className={`${text} w-[140px] tracking-[-0.64px]`}>{f.assignee?.name ?? "------"}</p>
                <div className="flex w-[120px] shrink-0">
                  <Badge label={cap(f.status)} width={96} />
                </div>
                <p className={`${text} w-[120px] text-center tracking-[-0.64px]`}>{day(f.dueDate)}</p>
                <p className={`${text} w-[120px] text-center`}>{day(f.completedAt)}</p>
                <div className="flex w-20 shrink-0 justify-center">
                  {/* Figma: ON_CLICK → "Mark As Completed" (1:7999), MANUAL overlay at (0,0) of this button, no backdrop; Edit and Delete join it */}
                  <span
                    className="inline-flex"
                    onClick={(e) => {
                      if (completing === f.id || removing === f.id) return;
                      anchor.current = e.currentTarget;
                      setMenuFor(f);
                    }}
                  >
                    <IconButton icon="more" label="Follow up actions" className="h-[38px]!" disabled={completing === f.id || removing === f.id} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Pagination {...paging(list.data, "Follow-ups", setPage)} />
      </section>

      <section className="flex min-w-0 flex-col gap-[10px] rounded-[22px] border border-stroke2 bg-primary px-5">
        <h2 className="pt-12 pb-10 text-[28px] font-medium text-black">Previous Follow Up History</h2>
        {!history.data && !history.error && (
          <SkeletonCards className="flex items-center justify-between gap-4 rounded-[24px] border border-stroke2 bg-bg5 px-4 py-5">
            <Skeleton className="h-5 w-64 max-w-[60%]" />
            <Skeleton className="h-[25px] w-[110px] rounded-[19px]" />
          </SkeletonCards>
        )}
        {!history.data && history.error && <LoadFailed what="follow-up history" onRetry={history.reload} />}
        {history.data?.items.map((h) => (
          <HistoryItem key={h.lead.id} name={h.lead.label} count={h.completedCount} entries={h.entries} />
        ))}
        {history.data?.items.length === 0 && <EmptyState>No completed follow-ups yet. They appear here once marked as completed.</EmptyState>}
        <Pagination {...paging(history.data, "Leads", setHistoryPage)} />
      </section>

      <Popover anchor={anchor} open={menuFor !== null} onClose={closeMenu} backdrop={false}>
        <div role="menu" aria-label="Follow up actions" className="flex flex-col overflow-hidden rounded-[8px] bg-bg5">
          {menuFor && menuFor.status !== "completed" && (
            <button suppressHydrationWarning type="button" role="menuitem" autoFocus onClick={markCompleted} className={menuItem}>
              <Icon name="mark" />
              Mark As Completed
            </button>
          )}
          <button
            suppressHydrationWarning
            type="button"
            role="menuitem"
            autoFocus={menuFor?.status === "completed"}
            onClick={() => {
              setEditing(menuFor);
              closeMenu();
            }}
            className={menuItem}
          >
            <Icon name="edit" />
            Edit
          </button>
          <button suppressHydrationWarning type="button" role="menuitem" onClick={() => menuFor && del(menuFor)} className={menuItem}>
            <Icon name="delete" />
            Delete
          </button>
        </div>
      </Popover>

      {/* Figma: "Add Follow - Up" ON_CLICK → New Follow Up (1:8040), TOP_CENTER, 50% backdrop, instant.
          This frame includes its stroke in layout (900px content in 966) → p-32 + 1px border. */}
      <Modal open={adding} onClose={closeModal} title="New Follow Up" className="w-[966px]" top>
        <NewFollowUpForm
          onCancel={closeModal}
          onSaved={() => {
            closeModal();
            refresh();
          }}
        />
      </Modal>
      <Modal open={editing !== null} onClose={closeEdit} title="Edit Follow Up" className="w-[966px]" top>
        {editing && (
          <NewFollowUpForm
            followUp={editing}
            onCancel={closeEdit}
            onSaved={() => {
              closeEdit();
              refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
