"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useRemove, useToast } from "@/components/feedback";
import { CardDetailsForm } from "@/components/rates/CardDetailsForm";
import { card, h2, primary, RatesFrame, secondary } from "@/components/rates/RatesFrame";
import { DetailSkeleton } from "@/components/skeletons";
import { EmptyState, LoadFailed, Pagination, SearchBox, Spinner } from "@/components/ui";
import { api, dateTime, fieldErrors, paging, useApi, useDebounced, type List } from "@/lib/api";
import { slabText, type CardDetails, type Courier, type RateCardDetail } from "@/lib/rates";

// One rate card: its details and charges (editable), every price as uploaded (with the cell it came from), and its
// destination list. Prices aren't edited here: a new rate list is uploaded as a new card.
export default function RateCardPage() {
  const { id } = useParams<{ id: string }>();
  const c = useApi<RateCardDetail>(`/rate-cards/${id}`);
  const couriers = useApi<Courier[]>("/couriers", undefined, 0, { keep: true });
  const [form, setForm] = useState<CardDetails | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { remove, removing } = useRemove(() => router.push("/settings/courier-rates"));
  const data = c.data;
  if (data && !form) {
    const { courier, account, ...rest } = data;
    setForm({ ...rest, courierId: courier.id, accountId: account?.id ?? null });
  }
  const save = async () => {
    if (!form || saving) return;
    setSaving(true);
    setErrors({});
    try {
      const body = form;
      await api(`/rate-cards/${id}`, { method: "PATCH", body: { courierId: body.courierId, accountId: body.accountId, name: body.name, scope: body.scope, service: body.service, contents: body.contents, origin: body.origin, currency: body.currency, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo, active: body.active, fuelPercent: body.fuelPercent, gstPercent: body.gstPercent, gstIncluded: body.gstIncluded, charges: body.charges } });
      toast.success("Rate card saved", form.name);
      setForm(null);
      c.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.apiError(err, "Couldn't save the rate card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RatesFrame sub={0} action={<Link href="/settings/courier-rates" className={secondary}>Back to rate cards</Link>}>
      {!data && !c.error && <DetailSkeleton />}
      {!data && c.error && <LoadFailed what="the rate card" onRetry={c.reload} />}
      {data && form && (
        <>
          <section className={card}>
            <div className="flex flex-col gap-0.5">
              <h2 className={h2}>{data.name}</h2>
              <p className="text-[14px] text-nav">
                {data.courier.name} · {data.account?.name ?? "general rates"} · {data.prices} prices{data.destinations ? ` · ${data.destinations} destinations` : ""}
                {data.import && ` · uploaded from ${data.import.fileName}${data.layout ? `, sheet “${data.layout.sheet}”, rows ${data.layout.table.firstRow}–${data.layout.table.lastRow}` : ""}`} · by {data.createdBy.name}, {dateTime(data.createdAt)} ·{" "}
                <Link href="/settings/courier-rates/couriers" className="font-semibold text-link hover:underline">
                  Rename or manage couriers
                </Link>
              </p>
            </div>
            <CardDetailsForm
              value={form}
              onChange={setForm}
              couriers={couriers.data?.map((x) => ({ id: x.id, name: x.name })) ?? [{ id: data.courier.id, name: data.courier.name }]}
              accounts={couriers.data?.find((x) => x.id === form.courierId)?.accounts.filter((a) => a.active || a.id === form.accountId) ?? []}
              errors={errors}
            />
            <div className="flex flex-wrap justify-between gap-2">
              <button
                suppressHydrationWarning
                type="button"
                disabled={removing === id}
                onClick={() =>
                  remove(id, {
                    path: `/rate-cards/${id}`,
                    title: "Delete rate card?",
                    message: (
                      <>
                        <b className="text-black">{data.name}</b> and its {data.prices} prices{data.destinations ? ` and ${data.destinations} destinations` : ""} will be deleted. The calculator stops using it at once.
                      </>
                    ),
                    confirmLabel: "Delete",
                    success: "Rate card deleted",
                    successDetail: data.name,
                    failTitle: "Couldn't delete the rate card",
                  })
                }
                className="flex h-10 cursor-pointer items-center gap-2 rounded-[12px] border border-danger/50 px-4 text-[14px] font-medium text-danger transition-colors hover:bg-danger/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60"
              >
                Delete rate card
              </button>
              <button suppressHydrationWarning type="button" onClick={save} disabled={saving} className={primary}>
                {saving && <Spinner />}
                Save details
              </button>
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Prices</h2>
            <p className="text-[13px] text-nav">Exactly as in the file (point at a price for its cell). A weight between two slabs is charged at the next slab up; above the flat slabs, at the per-kg band it falls in.</p>
            <div className="table-scroll max-h-[520px] overflow-y-auto rounded-[12px] border border-stroke2">
              <table className="w-max min-w-full border-collapse text-[13px]">
                <thead className="sticky top-0 z-[1] bg-primary">
                  <tr>
                    <th className="sticky left-0 bg-primary px-2.5 py-2 text-left font-medium text-nav">Weight</th>
                    {data.zones.map((z) => (
                      <th key={z} className="max-w-[160px] border-l border-stroke2 px-2.5 py-2 text-left font-semibold text-black">{z}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.weights.map((w, i) => (
                    <tr key={w.label} className="border-t border-stroke2">
                      <td className="sticky left-0 bg-primary px-2.5 py-1.5 whitespace-nowrap">
                        <b className="text-black">{w.label}</b> <span className="text-[12px] text-nav">{slabText(w)}</span>
                      </td>
                      {data.zones.map((z, j) => {
                        const p = data.grid[i]?.[j];
                        return (
                          <td key={z} className={`border-l border-stroke2 px-2.5 py-1.5 text-right ${p ? "text-black" : "text-nav/50"}`} title={p?.cell}>
                            {p?.price ?? "–"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.destinations > 0 && <Destinations id={id} />}
        </>
      )}
    </RatesFrame>
  );
}

function Destinations({ id }: { id: string }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(query);
  const [searched, setSearched] = useState(q);
  if (searched !== q) {
    setSearched(q);
    setPage(1);
  }
  const list = useApi<List<{ destination: string; zone: string; cell: string }>>(`/rate-cards/${id}/destinations`, { q, page, pageSize: 30 });
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={h2}>Destinations and their zones</h2>
        <SearchBox value={query} onChange={setQuery} />
      </div>
      {list.data?.items.length === 0 && <EmptyState>No destination matches.</EmptyState>}
      {list.data && list.data.items.length > 0 && (
        <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.items.map((d) => (
            <li key={d.cell} className="flex justify-between gap-2 border-b border-stroke2 py-1.5 text-[14px]" title={d.cell}>
              <span className="text-black">{d.destination}</span>
              <span className="font-semibold text-selected">{d.zone}</span>
            </li>
          ))}
        </ul>
      )}
      {list.data && <Pagination {...paging(list.data, "Destinations", setPage)} />}
    </section>
  );
}
