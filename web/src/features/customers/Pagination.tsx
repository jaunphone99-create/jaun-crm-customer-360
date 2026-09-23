import { int } from "@/lib/format/number";

import { FILTER_FORM_ID } from "./FilterBar";

/* ปุ่มเลื่อนหน้า (C-PAGINATION)

   เป็นปุ่ม submit ของฟอร์มตัวกรอง (attribute form=) ไม่ใช่ลิงก์ — เพราะแบบนี้ปุ่มจะพา
   ค่าตัวกรองที่ผู้ใช้เลือกอยู่ไปด้วยเองโดยไม่ต้องประกอบ query string ซ้ำในสองที่
   ถ้ายังไม่รู้ยอดรวม (ฐานข้อมูลไม่ได้คืน count มา) ยังบอกได้ว่ามีหน้าถัดไปไหม
   จากจำนวนแถวที่ได้จริง = เต็มหน้าพอดี */

function PageButton({ page, current }: { page: number; current: number }) {
  const isCurrent = page === current;
  return (
    <button
      type="submit"
      form={FILTER_FORM_ID}
      name="page"
      value={String(page)}
      className="pagination__page"
      aria-label={`หน้า ${int(page)}`}
      {...(isCurrent ? { "aria-current": "page" as const } : {})}
    >
      {int(page)}
    </button>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  shown,
}: {
  page: number;
  total: number | null;
  pageSize: number;
  shown: number;
}) {
  const pageCount = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const hasNext = pageCount === null ? shown === pageSize : page < pageCount;
  const hasPrev = page > 1;
  if (!hasPrev && !hasNext) return null;

  /* หน้าแรก · หน้ารอบตัว · หน้าสุดท้าย — พอให้กดข้ามได้โดยไม่ยาวเกินจอมือถือ */
  const numbers: number[] = [];
  if (pageCount !== null) {
    for (const p of [1, page - 1, page, page + 1, pageCount]) {
      if (p >= 1 && p <= pageCount && !numbers.includes(p)) numbers.push(p);
    }
    numbers.sort((a, b) => a - b);
  }

  return (
    <nav className="pagination__pages" aria-label="เลื่อนหน้ารายการ">
      <button
        type="submit"
        form={FILTER_FORM_ID}
        name="page"
        value={String(page - 1)}
        className="pagination__page"
        disabled={!hasPrev}
        aria-label="หน้าก่อนหน้า"
      >
        ‹
      </button>

      {numbers.map((p, i) => (
        <span className="row" key={p} style={{ gap: "var(--space-1)" }}>
          {i > 0 && p - (numbers[i - 1] ?? 0) > 1 ? <span aria-hidden="true">…</span> : null}
          <PageButton page={p} current={page} />
        </span>
      ))}

      <button
        type="submit"
        form={FILTER_FORM_ID}
        name="page"
        value={String(page + 1)}
        className="pagination__page"
        disabled={!hasNext}
        aria-label="หน้าถัดไป"
      >
        ›
      </button>
    </nav>
  );
}
