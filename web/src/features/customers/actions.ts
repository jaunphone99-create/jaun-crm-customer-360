"use server";

import { requireAccess } from "@/lib/access";
import { toThaiMessage } from "@/lib/errors";

import { loadPeriod, searchCustomerRows } from "./queries";
import { SEARCH_IDLE, type Preset, type SearchState } from "./types";

/* การค้นหาของหน้า 03

   ทำไมถึงเป็น Server Action แทนที่จะเป็นตัวกรองใน query string เหมือนตัวกรองอื่น:
   sitemap-screen-specs ข้อ 6.9 สั่งว่า "ไม่มีคำค้นใน URL" เพราะคำค้นเป็นข้อมูลส่วนบุคคลได้
   (เบอร์โทร · อีเมล · LINE ID) แล้ว URL จะไปโผล่ในประวัติเบราว์เซอร์ ลิงก์ที่แชร์ และ log ของเซิร์ฟเวอร์
   ส่งแบบ POST จึงเป็นวิธีเดียวที่ทำตามข้อนี้ได้จริง */

const MIN_TERM = 3;

export async function searchCustomers(_prev: SearchState, formData: FormData): Promise<SearchState> {
  const term = String(formData.get("term") ?? "").trim();
  const preset = (String(formData.get("preset") ?? "LAST_30_DAYS") === "TODAY" ? "TODAY" : "LAST_30_DAYS") as Preset;

  if (term === "") return SEARCH_IDLE;
  if (term.length < MIN_TERM) {
    return { ...SEARCH_IDLE, status: "invalid", term, message: "พิมพ์อย่างน้อย 3 ตัวอักษร" };
  }

  try {
    await requireAccess();
    const period = await loadPeriod(preset);
    const found = await searchCustomerRows(term, period);

    if (!found.ok) {
      /* RPC ปฏิเสธเพราะเกินเกณฑ์การค้นต่อชั่วโมง — บอกตรง ๆ ดีกว่าปล่อยให้ดูเหมือนไม่พบผล */
      return {
        ...SEARCH_IDLE,
        status: "error",
        term,
        message:
          found.code === "SEARCH_LIMIT_EXCEEDED"
            ? "ค้นหาเกินจำนวนที่กำหนดในชั่วโมงนี้ ลองใหม่อีกครั้งภายหลัง"
            : "ค้นหาไม่สำเร็จ กรุณาลองใหม่",
      };
    }

    return {
      status: "ok",
      term,
      message: null,
      rows: found.rows,
      otherGroups: found.otherGroups,
    };
  } catch (e) {
    const thai = toThaiMessage(e);
    return { ...SEARCH_IDLE, status: "error", term, message: thai.title };
  }
}
