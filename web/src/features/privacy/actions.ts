"use server";

import { revalidatePath } from "next/cache";

import { rpc } from "@/lib/db";
import { toThaiMessage } from "@/lib/errors";

import type { ActionState } from "./types";

/* การกระทำทั้งหมดของหน้า 17 · PDPA

   ทุกตัวส่งต่อให้ฐานข้อมูลตัดสิน — แอปไม่เช็คสิทธิ์เองก่อนแล้วคิดว่าพอ
   การซ่อนหรือปิดปุ่มบนหน้าจอเป็นเรื่องความสะดวกล้วน ๆ ผู้ปฏิเสธจริงคือ RPC และ RLS

   สองข้อที่หน้านี้ห้ามพลาด:
   1. ไม่มี action ไหน "ช่วย" เติมค่าที่ฐานข้อมูลบังคับให้ระบุ เช่น เหตุผล หรือวิธียืนยันตัวตน
      เพราะค่าที่เติมเองจะไปโผล่ใน audit เป็นคำให้การของผู้ใช้ ทั้งที่ผู้ใช้ไม่ได้พูด
   2. การทำข้อมูลนิรนามไม่มีทางลัดใด ๆ ที่นี่ — เงื่อนไข 2-person control
      (ผู้ดำเนินการ ≠ ผู้ยืนยันตัวตน) ตรวจที่ api.anonymize_customer เท่านั้น */

const PRIVACY = "/privacy";

/** แปลงข้อผิดพลาดให้เป็นข้อความที่แสดงบนจอได้ — ข้อความดิบของฐานข้อมูลห้ามขึ้นจอ */
function fail(e: unknown): ActionState {
  const thai = toThaiMessage(e);
  return { ok: false, title: thai.title, detail: thai.detail ?? null };
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/* ------------------------------------------------------------------ รับคำขอใหม่ */

/**
 * รับคำขอของเจ้าของข้อมูล (api.create_dsr · ข้อ 10.4)
 *
 * ช่องทางติดต่อของผู้ยื่นถูกส่งไปเต็มค่าแล้วฐานข้อมูลเก็บเฉพาะค่าปิดบัง (app.mask_pii_text)
 * แอปจึงไม่ปิดบังเองก่อนส่ง — ถ้าปิดบังสองชั้นจะติดต่อกลับผู้ยื่นไม่ได้เลย
 */
export async function createDsr(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const requestType = text(formData, "request_type");
    const requesterName = text(formData, "requester_name");
    if (!requestType) return { ok: false, title: "เลือกประเภทคำขอก่อน" };
    if (!requesterName) return { ok: false, title: "ต้องระบุชื่อผู้ยื่นคำขอ" };

    const result = await rpc<{ ok: boolean; request_no?: string }>("create_dsr", {
      p: {
        request_type: requestType,
        requester_name: requesterName,
        requester_contact: text(formData, "requester_contact"),
        customer_id: text(formData, "customer_id") || null,
        note: text(formData, "note") || null,
      },
    });
    revalidatePath(PRIVACY);
    return {
      ok: true,
      title: `รับคำขอแล้ว${result?.request_no ? ` · ${result.request_no}` : ""}`,
      detail: "กำหนดเสร็จ = วันที่รับ + 30 วัน · ฐานข้อมูลเป็นผู้คำนวณและเก็บช่องทางผู้ยื่นแบบปิดบัง",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------- เปลี่ยนสถานะคำขอ */

/**
 * เปลี่ยนสถานะคำขอ (api.update_dsr)
 *
 * ลำดับสถานะที่อนุญาตอยู่ในฐานข้อมูล ไม่ได้อยู่ที่นี่ — ที่นี่แค่ส่งสถานะที่ผู้ใช้กด
 * ถ้าผู้ใช้กดข้ามขั้น ฐานข้อมูลจะตอบว่าเปลี่ยนจากสถานะเดิมเป็นสถานะใหม่ไม่ได้ ซึ่งเป็นคำตอบที่ถูกต้อง
 *
 * VERIFIED เป็นขั้นที่ฐานข้อมูลบันทึก verified_by = ผู้กด และค่านั้นคือหลักฐานของ 2-person control
 * ในขั้นทำข้อมูลนิรนามภายหลัง จึงห้ามให้ใครกดแทนกัน
 */
export async function updateDsr(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const dsrId = text(formData, "dsr_id");
    const status = text(formData, "status");
    if (!dsrId || !status) return { ok: false, title: "ไม่พบคำขอที่เลือก" };

    const payload: Record<string, unknown> = {};
    const method = text(formData, "verification_method");
    const extendedUntil = text(formData, "extended_until");
    const extensionReason = text(formData, "extension_reason");
    const note = text(formData, "note");

    if (status === "VERIFIED") {
      if (!method) return { ok: false, title: "เลือกวิธียืนยันตัวตนก่อน", detail: "ห้ามเก็บสำเนาบัตรประชาชน" };
      payload.verification_method = method;
    }
    if (extendedUntil) {
      if (!extensionReason) return { ok: false, title: "ต้องระบุเหตุผลของการขยายเวลา" };
      payload.extended_until = extendedUntil;
      payload.extension_reason = extensionReason;
    }
    if (status === "REJECTED" && !note) {
      return { ok: false, title: "ต้องระบุเหตุผลที่ปฏิเสธคำขอ" };
    }
    if (note) payload.note = note;

    await rpc("update_dsr", { p_dsr_id: dsrId, p_status: status, p: payload });
    revalidatePath(PRIVACY);

    const titles: Record<string, string> = {
      VERIFIED: "ยืนยันตัวตนผู้ยื่นคำขอแล้ว",
      IN_PROGRESS: "เริ่มดำเนินการแล้ว",
      COMPLETED: "ปิดคำขอว่าเสร็จสิ้นแล้ว",
      REJECTED: "ปฏิเสธคำขอแล้ว",
    };
    return {
      ok: true,
      title: titles[status] ?? "บันทึกสถานะคำขอแล้ว",
      detail:
        status === "VERIFIED"
          ? "ระบบบันทึกว่าคุณคือผู้ยืนยันตัวตน · การทำข้อมูลนิรนามของคำขอนี้ต้องให้คนอื่นเป็นผู้ดำเนินการ (ข้อ 10.4 · Q26)"
          : null,
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * ขยายเวลาดำเนินการ (api.update_dsr โดยคงสถานะเดิม)
 *
 * แยกจาก updateDsr เพราะการขยายเวลาไม่ควรพ่วงการเปลี่ยนสถานะมาด้วยโดยไม่ตั้งใจ
 * สถานะปัจจุบันถูกส่งกลับไปเป็นสถานะเดิม — api.update_dsr ตรวจคู่ (เดิม → ใหม่) อยู่แล้ว
 * ซึ่งแปลว่าถ้าส่งสถานะผิด ฐานข้อมูลจะปฏิเสธ ไม่ใช่เงียบ ๆ เปลี่ยนให้
 */
export async function extendDsr(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const dsrId = text(formData, "dsr_id");
    const currentStatus = text(formData, "current_status");
    const until = text(formData, "extended_until");
    const reason = text(formData, "extension_reason");
    if (!dsrId || !currentStatus) return { ok: false, title: "ไม่พบคำขอที่เลือก" };
    if (!until) return { ok: false, title: "เลือกวันที่ขยายถึงก่อน" };
    if (!reason) return { ok: false, title: "ต้องระบุเหตุผลของการขยายเวลา" };

    await rpc("update_dsr", {
      p_dsr_id: dsrId,
      p_status: currentStatus,
      p: { extended_until: until, extension_reason: reason },
    });
    revalidatePath(PRIVACY);
    return { ok: true, title: "ขยายเวลาแล้ว", detail: "เหตุผลถูกเก็บไว้กับคำขอและปรากฏในร่องรอยการทำงาน" };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------------------------------------- แพ็กเกจข้อมูล */

/**
 * สร้างแพ็กเกจข้อมูลของคำขอ ACCESS/PORTABILITY (api.build_dsr_package)
 *
 * RPC คืนตัวแพ็กเกจกลับมาทั้งก้อนซึ่งมีค่าเต็มของช่องทางติดต่อและที่อยู่อยู่ข้างใน
 * หน้าจอจึงรายงานแค่ "สร้างแล้ว" กับรายชื่อหมวดที่อยู่ในแพ็กเกจ ไม่แสดงค่าข้างใน
 * เพราะการเอา PII ทั้งก้อนขึ้นจอเพื่อให้คนคัดลอกคือช่องทางรั่วที่ไม่มีใครตรวจได้ (ข้อ 6.4)
 *
 * ช่องทางส่งมอบแพ็กเกจให้เจ้าของข้อมูลยังไม่ถูกต่อไว้ — ดู blockers ของงานนี้
 */
export async function buildDsrPackage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const dsrId = text(formData, "dsr_id");
    if (!dsrId) return { ok: false, title: "ไม่พบคำขอที่เลือก" };

    const result = await rpc<{ ok: boolean; request_no?: string; package?: Record<string, unknown> }>(
      "build_dsr_package",
      { p_dsr_id: dsrId }
    );
    revalidatePath(PRIVACY);
    return {
      ok: true,
      title: `สร้างแพ็กเกจข้อมูลของ ${result?.request_no ?? "คำขอนี้"} แล้ว`,
      detail: "ระบบบันทึก DSR_PACKAGE_BUILT ไว้ในร่องรอยการทำงานแล้ว · ยังไม่มีช่องทางส่งมอบไฟล์ในระบบ",
      packageSections: result?.package ? Object.keys(result.package) : null,
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------- ทำข้อมูลนิรนาม */

/**
 * ทำข้อมูลนิรนามตามคำขอลบ (api.anonymize_customer · ย้อนกลับไม่ได้)
 *
 * **ฐานข้อมูลเป็นผู้บังคับ 2-person control ทั้งหมด** ตามลำดับนี้:
 *   require_permission('customer.anonymize') 🔐 → ลูกค้าต้องไม่ติด legal hold →
 *   ต้องอ้าง DSR ที่ผูกลูกค้ารายเดียวกัน → DSR ต้อง VERIFIED/IN_PROGRESS และมี verified_by →
 *   **verified_by ต้องไม่ใช่ผู้เรียก** → ต้องไม่เกินเพดาน dsr.anonymize_per_day
 *
 * ที่นี่ไม่ทำซ้ำเงื่อนไขไหนเลยนอกจากบังคับให้ผู้ใช้พิมพ์รหัสลูกค้ายืนยัน
 * ซึ่งเป็นการกันมือลั่น ไม่ใช่การตรวจสิทธิ์
 */
export async function anonymizeCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const customerId = text(formData, "customer_id");
    const customerNo = text(formData, "customer_no");
    const dsrId = text(formData, "dsr_id");
    const confirm = text(formData, "confirm");
    if (!customerId || !dsrId) return { ok: false, title: "ไม่พบลูกค้าหรือคำขอที่เลือก" };
    if (confirm !== customerNo) {
      return { ok: false, title: "พิมพ์รหัสลูกค้าให้ตรงก่อน", detail: `ต้องพิมพ์ ${customerNo} เพื่อยืนยัน` };
    }
    if (formData.get("ack") !== "on") {
      return { ok: false, title: "ยืนยันว่าเข้าใจผลกระทบก่อน", detail: "ติ๊กช่อง “ฉันเข้าใจว่าย้อนกลับไม่ได้” แล้วกดอีกครั้ง" };
    }

    await rpc("anonymize_customer", { p_customer_id: customerId, p_dsr_id: dsrId });
    revalidatePath(PRIVACY);
    return {
      ok: true,
      title: `ทำข้อมูลนิรนาม ${customerNo} แล้ว`,
      detail: "ระบบบันทึก CUSTOMER_ANONYMIZED พร้อมชื่อผู้ดำเนินการไว้แล้ว · ตัวเลข KPI ย้อนหลังไม่เปลี่ยน",
    };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------------------------------------- ความยินยอม */

/**
 * บันทึกความยินยอม (api.record_consent · ข้อ 10.2)
 *
 * เป็น append-only: การถอนความยินยอมคือการบันทึกแถวใหม่สถานะ WITHDRAWN ไม่ใช่การแก้แถวเดิม
 * ธงอายุของ MARKETING GRANTED ถูกส่งเป็น age_ack และฐานข้อมูลเป็นผู้ปฏิเสธถ้าไม่มี (19.4 ข้อ 3)
 */
export async function recordConsent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const customerId = text(formData, "customer_id");
    const purposeCode = text(formData, "purpose_code");
    const status = text(formData, "status") === "WITHDRAWN" ? "WITHDRAWN" : "GRANTED";
    const capturedVia = text(formData, "captured_via");
    const evidence = text(formData, "evidence");
    if (!customerId || !purposeCode) return { ok: false, title: "เลือกลูกค้าและวัตถุประสงค์ก่อน" };
    if (!capturedVia) return { ok: false, title: "เลือกวิธีที่ได้รับความยินยอมก่อน" };

    const channels = formData.getAll("channels").map((c) => String(c));

    await rpc("record_consent", {
      p: {
        customer_id: customerId,
        purpose_code: purposeCode,
        status,
        captured_via: capturedVia,
        channels,
        age_ack: formData.get("age_ack") === "on",
        evidence: evidence || null,
      },
    });
    revalidatePath(PRIVACY);
    return {
      ok: true,
      title: status === "GRANTED" ? "บันทึกความยินยอมแล้ว" : "บันทึกการถอนความยินยอมแล้ว",
      detail: "บันทึกเป็นแถวใหม่ · แถวเดิมยังอยู่ครบเพื่อใช้พิสูจน์ย้อนหลัง (แก้หรือลบไม่ได้)",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------------------------------------------------------- legal hold */

/**
 * ตั้ง/ยกเลิกการระงับการลบตามกฎหมาย (api.set_legal_hold · ข้อ 10.3)
 *
 * เหตุผลไม่ใช่ของประดับ: ฐานข้อมูลบังคับให้มี และเอาไปใส่ app.audit_reason
 * ซึ่งเป็นคำตอบเดียวของคำถาม "ใครตั้งไว้ เพราะอะไร" ในภายหลัง
 */
export async function setLegalHold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const customerId = text(formData, "customer_id");
    const on = text(formData, "legal_hold") === "on";
    const reason = text(formData, "reason");
    if (!customerId) return { ok: false, title: "ไม่พบลูกค้าที่เลือก" };
    if (!reason) return { ok: false, title: "ต้องระบุเหตุผลของการตั้ง/ยกเลิก legal hold" };

    await rpc("set_legal_hold", { p_customer_id: customerId, p_on: on, p_reason: reason });
    revalidatePath(PRIVACY);
    return {
      ok: true,
      title: on ? "ตั้ง legal hold แล้ว" : "ยกเลิก legal hold แล้ว",
      detail: on
        ? "ลูกค้ารายนี้จะถูกข้ามจากการทำข้อมูลนิรนามทั้งตามคำขอและตามระยะเวลาเก็บ"
        : "ลูกค้ารายนี้กลับเข้าเงื่อนไขการทำข้อมูลนิรนามตามปกติ",
    };
  } catch (e) {
    return fail(e);
  }
}
