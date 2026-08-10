"use client";

import { BILL_TYPE_LABELS, categoryColor, expenseCategoryLabel } from "@/lib/constants";
import type { BillType, ExpenseCategory } from "@/types/domain";

/**
 * The category cell of the expenses table.
 *
 * A bill's type sits on its own line rather than trailing the category behind a
 * separator. Inline, the "· Électricité" wrapped to the next line in a narrow
 * column and left the separator stranded at the end of the first — the column
 * is not wide enough to hold both on one line, and pretending otherwise only
 * works until someone has a real category name and a real bill type.
 *
 * The same two-line shape the Vendor cell beside it already uses.
 */
export function ExpenseCategoryCell({
  category,
  billType,
}: {
  category: ExpenseCategory;
  billType: BillType | null;
}) {
  return (
    <span className="flex items-start gap-2">
      <span
        aria-hidden
        // Nudged to sit on the first line's baseline, not the block's top.
        className="mt-[5px] size-2 shrink-0 rounded-full"
        style={{ background: categoryColor(category) }}
      />
      <span className="block min-w-0">
        <span className="block truncate text-ink">{expenseCategoryLabel(category)}</span>
        {billType ? (
          <span className="block truncate text-[12px] text-ink-3">
            {BILL_TYPE_LABELS[billType]}
          </span>
        ) : null}
      </span>
    </span>
  );
}
