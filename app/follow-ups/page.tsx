"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useRemove, useReport, useToast } from "@/components/feedback";
import { Skeleton, SkeletonCards, SkeletonRows, SubtitleSkeleton } from "@/components/skeletons";
import { Badge, EmptyState, FilterMenu, IconButton, LoadFailed, Modal, PageHeader, Pagination, Popover, PrimaryButton, SearchBox, ToolButton } from "@/components/ui";
import { HistoryItem } from "@/components/followups/HistoryItem";
import { NewFollowUpForm, TYPE_LABEL, type FollowUp } from "@/components/followups/NewFollowUpForm";
import { api, cap, day, paging, pastEnd, useApi, useDebounced, type List } from "@/lib/api";

const text = "shrink-0 text-[14px] font-medium text-black";
// Figma's one "Mark As Completed" item (1:7999), repeated for each action.
const menuItem =
  "flex h-9 w-full cursor-pointer items-center gap-2 border-b-[0.5px] border-stroke2 px-3.5 text-left text-[14px] whitespace-nowrap text-nav last:border-b-0 hover:bg-[rgb(71_215_251/0.2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";
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
  const report = useReport("/follow-ups/export", "Follow-ups report");

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title="Follow - Up Centre"
        subtitle={list.data ? `${list.data.pendingCount} Pending · ${list.data.overdueCount} Overdue` : !list.error && <SubtitleSkeleton />}
        action={<PrimaryButton onClick={() => setAdding(true)}>Add Follow - Up</PrimaryButton>}
      />

      <section className="flex min-w-0 flex-col rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-end gap-2 py-4">
          <SearchBox
            value={query}
            onChange={setQuery}
          />
          {/* Report: every follow-up matching the search and status (all pages), as CSV */}
          <ToolButton label="Report" icon="download" busy={report.busy} onClick={() => report.run({ q, status })} />
          <ToolButton label="Filter" icon="filter" btnRef={filterBtn} count={status ? 1 : 0} onClick={() => setFiltering(true)} />
          <Popover anchor={filterBtn} open={filtering} onClose={closeFilter} dx={-38.2} dy={46}>
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

        <div className="table-scroll">
          {/* The note takes any spare width, so the rows always reach the card's edge (as in the history below). */}
          <div className="flex min-w-[900px] flex-col">
            <div className="flex items-start border-b border-stroke2 py-3 text-[13px] font-medium text-nav/80 *:shrink-0">
              <p className="min-w-[260px] flex-1 pr-4">Note</p>
              <p className="w-[120px]">Type</p>
              <p className="w-[140px]">Assigned To</p>
              <p className="w-[108px]">Status</p>
              <p className="w-[104px] text-center">Due Date</p>
              <p className="w-[104px] text-center">Completed</p>
              <p className="w-16 text-center">Actions</p>
            </div>

            {!list.data && !list.error && <SkeletonRows columns={["flex", 120, 140, 108, 104, 104, 64]} twoLine />}
            {!list.data && list.error && <LoadFailed what="follow-ups" onRetry={list.reload} />}
            {list.data?.items.length === 0 && list.data.page === page && <EmptyState>{query || status ? "No follow-ups match your search or filter." : "No follow-ups yet. Use Add Follow - Up to schedule one."}</EmptyState>}
            {list.data?.items.map((f) => (
              <div key={f.id} className="flex items-center border-b border-stroke2 py-2.5">
                <div className="flex min-w-[260px] flex-1 flex-col gap-0.5 pr-4 font-medium">
                  <p className="text-[14px] text-black">{f.note}</p>
                  <p className="text-[13px] text-link">{f.lead.label}</p>
                </div>
                <p className={`${text} w-[120px]`}>{TYPE_LABEL[f.type]}</p>
                <p className={`${text} w-[140px] pr-2`}>{f.assignee?.name ?? "------"}</p>
                <div className="flex w-[108px] shrink-0">
                  <Badge label={cap(f.status)} width={84} />
                </div>
                <p className={`${text} w-[104px] text-center`}>{day(f.dueDate)}</p>
                <p className={`${text} w-[104px] text-center`}>{day(f.completedAt)}</p>
                <div className="flex w-16 shrink-0 justify-center">
                  {/* Figma: ON_CLICK → "Mark As Completed" (1:7999), MANUAL overlay at (0,0) of this button, no backdrop; Edit and Delete join it */}
                  <span
                    className="inline-flex"
                    onClick={(e) => {
                      if (completing === f.id || removing === f.id) return;
                      anchor.current = e.currentTarget;
                      setMenuFor(f);
                    }}
                  >
                    <IconButton icon="more" label="Follow up actions" disabled={completing === f.id || removing === f.id} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Pagination {...paging(list.data, "Follow-ups", setPage)} />
      </section>

      <section className="flex min-w-0 flex-col gap-2 rounded-[16px] border border-stroke2 bg-primary px-4 sm:px-5">
        <h2 className="py-4 text-[18px] font-semibold tracking-[-0.36px] text-black">Previous Follow Up History</h2>
        {!history.data && !history.error && (
          <SkeletonCards className="flex items-center justify-between gap-4 rounded-[14px] border border-stroke2 bg-bg5 px-4 py-3">
            <Skeleton className="h-4 w-64 max-w-[60%]" />
            <Skeleton className="h-5 w-[100px] rounded-full" />
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
        <div role="menu" aria-label="Follow up actions" className="flex flex-col overflow-hidden rounded-[10px] border border-stroke2 bg-bg5 shadow-[0_8px_24px_rgb(21_46_175/0.12)]">
          {menuFor && menuFor.status !== "completed" && (
            <button suppressHydrationWarning type="button" role="menuitem" autoFocus onClick={markCompleted} className={menuItem}>
              <Icon name="mark" size={18} />
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
            <Icon name="edit" size={18} />
            Edit
          </button>
          <button suppressHydrationWarning type="button" role="menuitem" onClick={() => menuFor && del(menuFor)} className={menuItem}>
            <Icon name="delete" size={18} />
            Delete
          </button>
        </div>
      </Popover>

      {/* Figma: "Add Follow - Up" ON_CLICK → New Follow Up (1:8040), TOP_CENTER, 50% backdrop, instant.
          Sized for its two-column form at 14px text. */}
      <Modal open={adding} onClose={closeModal} title="New Follow Up" className="w-[760px]" top>
        <NewFollowUpForm
          onCancel={closeModal}
          onSaved={() => {
            closeModal();
            refresh();
          }}
        />
      </Modal>
      <Modal open={editing !== null} onClose={closeEdit} title="Edit Follow Up" className="w-[760px]" top>
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
