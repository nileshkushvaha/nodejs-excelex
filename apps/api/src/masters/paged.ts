/**
 * The paged-list shape, once.
 *
 * Customers, consignees, shippers and destinations each had their own copy of
 * the same twenty lines: clamp the page, clamp the size, count and fetch in
 * parallel, compute the page count. Four copies is four places for an
 * off-by-one, and the audit found the pager component had already been written
 * twice before anyone extracted it.
 *
 * Which masters use this is a decision about data, not a default. Products,
 * charges and service centres are deliberately unpaged: the client's live
 * system has seventeen products, eighteen charges and one service centre.
 * Paging them would cost a round trip per filter keystroke to solve a problem
 * they do not have, and the filter bar already says client-side filtering is
 * honest while a master fits in one response.
 */
export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly rows: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

/** Twenty rows, and never more than a hundred however the caller asks. */
export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 5;

export function readPageRequest(query: Record<string, string | undefined>): PageRequest {
  return {
    page: Number(query["page"] ?? 1) || 1,
    pageSize: Number(query["pageSize"] ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE,
  };
}

/**
 * The two delegate methods this needs.
 *
 * Typed loosely because the point is one code path over a dozen models, and
 * Prisma's per-model argument types cannot be unified without a generic
 * threaded through every caller to say nothing new. The `where` a caller
 * passes is still checked at the call site, where it is built from that
 * model's own typed helper.
 */
interface Countable {
  // Prisma's count() is typed to return a number or a selection object,
  // depending on an overload this call never uses. Narrowed at the point of
  // use rather than fought with here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  count: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany: (args: any) => Promise<any[]>;
}

export async function paginate<Row, Mapped>(
  delegate: Countable,
  options: {
    where: unknown;
    include?: unknown;
    orderBy: unknown;
    request: PageRequest;
  },
  map: (row: Row) => Mapped,
): Promise<Page<Mapped>> {
  const page = Math.max(1, options.request.page);
  // Clamped, so a hand-edited pageSize cannot ask for the whole master.
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, options.request.pageSize));

  // Counted and fetched together. They must see one snapshot, or the last
  // page can report rows it cannot show.
  const [total, rows] = await Promise.all([
    delegate.count({ where: options.where }),
    delegate.findMany({
      where: options.where,
      ...(options.include ? { include: options.include } : {}),
      orderBy: options.orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    rows: (rows as Row[]).map(map),
    total: Number(total),
    page,
    pageSize,
    // At least one, so an empty master reports "page 1 of 1" rather than
    // "page 1 of 0", which reads as a bug.
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
