// Pipeline board updates without a refetch: a drag's optimistic move, its rollback and the server's confirmed copy
// all go through place(), so the three can never disagree about counts, totals or card order.

type Card = { id: string; status: { id: string }; expectedValue: number | null; createdAt: string };
export type Column<C extends Card> = { status: { id: string }; count: number; totalValue: number; items: C[] };

const money = (n: number) => Math.round(n * 100) / 100; // keeps ₹100.1 + ₹200.2 from showing as 300.30000000000004

/** Same order as GET /leads/pipeline: newest first, then by id. */
const before = (a: Card, b: Card) => a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);

/**
 * The board with `card` in the column of `card.status`, taken out of whichever column held it, with both columns'
 * counts and value totals adjusted. A card that isn't on the board (filtered out, or gone after a reload) is left
 * alone: the board only ever changes cards it shows.
 */
export function place<C extends Card, B extends { columns: Column<C>[] }>(board: B, card: C): B {
  const from = board.columns.find((c) => c.items.some((i) => i.id === card.id));
  if (!from) return board;
  const old = from.items.find((i) => i.id === card.id)!;
  const columns = board.columns.map((c) => {
    let { items, count, totalValue } = c;
    if (c === from) {
      items = items.filter((i) => i.id !== card.id);
      count -= 1;
      totalValue -= old.expectedValue ?? 0;
    }
    if (c.status.id === card.status.id) {
      const at = items.findIndex((i) => before(card, i));
      items = at < 0 ? [...items, card] : [...items.slice(0, at), card, ...items.slice(at)];
      count += 1;
      totalValue += card.expectedValue ?? 0;
    }
    return items === c.items ? c : { ...c, items, count, totalValue: money(totalValue) };
  });
  return { ...board, columns };
}

type Versioned = Card & { version: number };
const find = <C extends Card>(board: { columns: Column<C>[] }, id: string) => board.columns.flatMap((c) => c.items).find((i) => i.id === id);

/**
 * A board read from the server with this tab's own moves kept: the read may have left before a move was saved and
 * come back after its reply (or while it is still saving), which put the card back in its old column, with wrong
 * counts, until the next refresh. `saved`: the server's copy after each move this tab saved; a card the read has at
 * an older version gets it back (the same version or a newer one, say someone else's later edit, is the read's).
 * `moving`: cards whose move is still being saved, in the stage chosen last. Unchanged → the same board object.
 */
export function reconcile<C extends Versioned, B extends { columns: Column<C>[] }>(board: B, saved: Iterable<C>, moving: Iterable<C>): B {
  let next = board;
  for (const copy of saved) {
    const shown = find(next, copy.id);
    if (shown && shown.version < copy.version) next = place(next, copy);
  }
  for (const card of moving) {
    const shown = find(next, card.id);
    if (shown && shown.status.id !== card.status.id) next = place(next, { ...shown, status: card.status });
  }
  return next;
}
