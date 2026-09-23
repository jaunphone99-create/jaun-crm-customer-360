"use server";

import { revalidatePath } from "next/cache";

import { getDb, rpc, RpcError } from "@/lib/db";
import { toThaiMessage } from "@/lib/errors";

import type { ActionState } from "./types";

/* การกระทำทั้งหมดของหน้า 12 · ศูนย์คุณภาพข้อมูล

   กติกาสองข้อที่ยึดตลอดทั้งไฟล์

   1. **ฐานข้อมูลเป็นผู้ปฏิเสธจริงเสมอ** — ที่นี่ไม่มีการเช็กสิทธิ์แล้วคิดว่าพอ
      RPC เรียก app.require_permission / app.can_access_record ให้เอง ส่วนการเขียนตารางตรง
      ผ่าน RLS + column grant ของ 0010_security.sql ซึ่งเป็นด่านเดียวกับที่หน้าอื่นใช้

   2. **แก้เสร็จแล้วต้องอ่านค่าใหม่จากฐานข้อมูล** — ทุกตัวจบด้วย revalidatePath
      ไม่มีที่ไหนลบแถวออกจาก state ฝั่ง client เพราะจะทำให้ตัวเลขดูลดทั้งที่ฐานข้อมูลยังไม่เปลี่ยน
      (ข้อกำหนดของงานนี้: "แก้ Data Quality แล้วรายการและ Counter ต้องลดตามจริง")

   หมายเหตุว่าทำไมบางตัวเขียนตารางตรงแทนที่จะเรียก RPC: CANONICAL ข้อ 12.3 กำหนดสิทธิ์ที่ใช้แก้
   ของแต่ละชนิดไว้ และบางชนิด (data_quality.resolve บนช่องของลูกค้า · task.update · lead.update ·
   transaction.link) ไม่มี RPC เฉพาะใน schema api — เส้นทางที่ 0010_security.sql เปิดไว้คือ
   GRANT รายคอลัมน์ + POLICY ของตารางนั้นโดยตรง */

const PAGE = "/data-quality";

function fail(e: unknown): ActionState {
  const thai = toThaiMessage(e);
  return { ok: false, title: thai.title, detail: thai.detail ?? null };
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * PostgREST ไม่ถือว่า "ไม่มีแถวไหนเข้าเงื่อนไข" เป็นความผิดพลาด
 *
 * เมื่อ RLS ตัดแถวทิ้ง คำสั่งจะสำเร็จแบบเงียบ ๆ และหน้าจอจะบอกว่า "บันทึกแล้ว" ทั้งที่ไม่มีอะไรเปลี่ยน
 * จึง select กลับมาทุกครั้งแล้วถือว่าไม่ได้แถว = ไม่มีสิทธิ์
 */
function assertWritten(source: string, rows: unknown[] | null): void {
  if (!rows || rows.length === 0) {
    throw new RpcError(source, "ไม่พบรายการนี้หรือไม่มีสิทธิ์แก้ไข");
  }
}

/**
 * เวลาอ้างอิงของระบบ
 *
 * ห้ามใช้นาฬิกาของเครื่องผู้ใช้ เพราะ app.clock() บน dev/staging ถูกตรึงไว้ (ข้อ 1.2)
 * ถาม api.get_kpis ด้วยเหตุผลเดียวกับหน้า 03 และ 07: เป็น RPC ที่คืน clock ของระบบ
 * และทุกบทบาทที่แก้ข้อมูลในหน้านี้ได้ก็มี dashboard.view อยู่แล้ว
 */
async function systemClock(): Promise<string> {
  const data = await rpc<{ clock: string }>("get_kpis", { p_preset: "TODAY" });
  return data.clock;
}

/* ------------------------------------------------- VISIT_UNRECORDED · รับทราบ */

/**
 * รับทราบการให้บริการที่ไม่ได้บันทึกผล (api.acknowledge_unrecorded_visit · ข้อ 9.6)
 *
 * ผลการให้บริการแก้ไม่ได้หลังข้ามวัน (ข้อ 4.1) การรับทราบจึงเป็นทางเดียวที่ทำให้รายการนี้หลุด
 * analytics.data_quality_issues ตัดแถวที่ unrecorded_ack_at ไม่ว่างออกให้เอง ตัวนับจึงลดตามจริง
 */
export async function acknowledgeVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const visitId = text(formData, "visit_id");
    if (!visitId) return { ok: false, title: "ไม่พบการให้บริการที่เลือก" };

    const result = await rpc<{ ok: boolean; already_acknowledged?: boolean }>("acknowledge_unrecorded_visit", {
      p_visit_id: visitId,
    });
    revalidatePath(PAGE);
    return {
      ok: true,
      title: result?.already_acknowledged ? "รายการนี้มีผู้รับทราบไว้แล้ว" : "บันทึกการรับทราบแล้ว",
      detail: "ระบบบันทึกชื่อและเวลาของผู้รับทราบไว้ · รายการนี้จะหลุดจากศูนย์คุณภาพข้อมูล",
    };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------------------- DUPLICATE_SUSPECTED · ตัดสินคู่ */

const MERGE_FIELDS = ["first_name", "last_name", "nickname", "province_code"] as const;

/**
 * รวมลูกค้าสองรายเข้าด้วยกัน (api.merge_customers · ข้อ 6.7)
 *
 * ฟอร์มส่งมาเป็นฝั่ง (NEWER = รายที่สร้างใหม่ · EXISTING = รายที่มีอยู่เดิม) ไม่ใช่ uuid ของค่าที่เลือก
 * เพราะ p_field_choices ของ RPC พูดภาษา "เอาค่าจากรายที่ถูกรวม (MERGED) หรือรายที่เก็บไว้"
 * การแปลงจึงต้องรู้ก่อนว่าผู้ใช้เลือกเก็บรายไหน แล้วค่อยแปลฝั่งเป็น MERGED
 */
export async function mergeDuplicate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const decisionId = text(formData, "decision_id");
    const newerId = text(formData, "newer_id");
    const existingId = text(formData, "existing_id");
    const survivorSide = text(formData, "survivor");
    const reason = text(formData, "reason");

    if (!newerId || !existingId) return { ok: false, title: "ไม่พบคู่ลูกค้าที่เลือก" };
    if (survivorSide !== "NEWER" && survivorSide !== "EXISTING") {
      return { ok: false, title: "เลือกก่อนว่าจะเก็บเลขลูกค้าของรายไหนไว้" };
    }
    if (!reason) return { ok: false, title: "ต้องระบุเหตุผลของการรวมลูกค้า" };
    if (formData.get("ack") !== "on") {
      return {
        ok: false,
        title: "ยืนยันว่าเข้าใจผลกระทบก่อน",
        detail: "การรวมลูกค้าย้อนกลับไม่ได้ใน V1 · ติ๊กช่องยืนยันแล้วกดอีกครั้ง",
      };
    }

    const mergedSide = survivorSide === "NEWER" ? "EXISTING" : "NEWER";
    const survivorId = survivorSide === "NEWER" ? newerId : existingId;
    const mergedId = survivorSide === "NEWER" ? existingId : newerId;

    /* ส่งเฉพาะช่องที่ผู้ใช้เลือก "เอาค่าของรายที่ถูกรวม" · ช่องที่ไม่ส่ง RPC จะเก็บค่าของรายที่อยู่ต่อ */
    const fieldChoices: Record<string, string> = {};
    for (const field of MERGE_FIELDS) {
      if (text(formData, `pick_${field}`) === mergedSide) fieldChoices[field] = "MERGED";
    }

    const result = await rpc<{ ok: boolean; merge_no?: string }>("merge_customers", {
      p_survivor_id: survivorId,
      p_merged_id: mergedId,
      p_field_choices: fieldChoices,
      p_reason: reason,
      p_duplicate_decision_id: decisionId || null,
    });

    revalidatePath(PAGE);
    return {
      ok: true,
      title: `รวมลูกค้าแล้ว${result?.merge_no ? ` · ${result.merge_no}` : ""}`,
      detail:
        "ย้ายช่องทางติดต่อ การให้บริการ Lead โอกาสขาย ใบเสนอราคา งาน เลขธุรกรรม โน้ต ความยินยอม และ Tag ไปยังลูกค้าที่เก็บไว้แล้ว · " +
        "ลูกค้าที่ถูกรวมเปลี่ยนสถานะเป็น “รวมแล้ว”",
    };
  } catch (e) {
    return fail(e);
  }
}

/** ยืนยันว่าเป็นคนละคน (api.decide_duplicate) — RPC รับสถานะนี้สถานะเดียว การรวมใช้ปุ่มอีกปุ่ม */
export async function decideNotDuplicate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const decisionId = text(formData, "decision_id");
    const note = text(formData, "note");
    if (!decisionId) return { ok: false, title: "ไม่พบรายการข้อมูลซ้ำนี้" };
    if (!note) return { ok: false, title: "ต้องระบุหมายเหตุของการตัดสิน" };

    await rpc("decide_duplicate", { p_decision_id: decisionId, p_status: "NOT_DUPLICATE", p_note: note });
    revalidatePath(PAGE);
    return {
      ok: true,
      title: "ยืนยันว่าเป็นคนละคนแล้ว",
      detail: "รายการนี้จะไม่ถูกนับเป็นลูกค้าอาจซ้ำอีก · ระบบบันทึกผู้ตัดสินและเวลาไว้แล้ว",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------------------------------- LEAD_WITHOUT_OWNER · มอบหมาย */

/**
 * มอบหมายผู้รับผิดชอบ (api.assign_owner · ข้อ 9.4.2)
 *
 * เป็นเส้นทางเดียวของการเปลี่ยนผู้รับผิดชอบ · trigger ปฏิเสธการ UPDATE owner_staff_id ตรง ๆ ด้วย T13
 * หน้านี้ใช้กับ Lead เท่านั้น แต่รับ entity_type มาจากฟอร์มเผื่อชนิดอื่นในอนาคต
 */
export async function assignOwner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const entityType = text(formData, "entity_type") || "LEAD";
    const entityId = text(formData, "entity_id");
    const toStaffId = text(formData, "to_staff_id");
    const reasonCode = text(formData, "reason_code");
    if (!entityId) return { ok: false, title: "ไม่พบรายการที่เลือก" };
    if (!toStaffId) return { ok: false, title: "เลือกผู้รับผิดชอบก่อน" };
    if (!reasonCode) return { ok: false, title: "เลือกเหตุผลของการมอบหมายก่อน" };

    const result = await rpc<{ ok: boolean; entity_ref?: string }>("assign_owner", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_to_staff_id: toStaffId,
      p_reason_code: reasonCode,
      p_note: text(formData, "note") || null,
      p_to_branch_id: null,
    });

    revalidatePath(PAGE);
    return {
      ok: true,
      title: `มอบหมาย${result?.entity_ref ? ` ${result.entity_ref}` : ""}แล้ว`,
      detail: "ระบบบันทึกประวัติการเปลี่ยนผู้รับผิดชอบและแจ้งผู้รับมอบหมายแล้ว",
    };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- MISSING_PHONE · INVALID_PHONE · เบอร์โทรศัพท์ */

/**
 * เพิ่มหรือแก้เบอร์โทรศัพท์ (api.save_contact · ข้อ 6.4)
 *
 * RPC เป็นผู้ normalize ปิดบัง และตัดสินว่า is_valid หรือไม่ (app.is_valid_thai_phone)
 * ฝั่งหน้าจอจึงไม่ตรวจรูปแบบเบอร์ซ้ำ นอกจากดูว่าไม่ว่าง — กติกาเบอร์ไทยมีที่เดียวคือฐานข้อมูล
 */
export async function savePhone(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const customerId = text(formData, "customer_id");
    const contactId = text(formData, "contact_id");
    const value = text(formData, "phone");
    if (!customerId) return { ok: false, title: "ไม่พบลูกค้ารายนี้" };
    if (!value) return { ok: false, title: "กรอกเบอร์โทรศัพท์ก่อน" };

    const result = await rpc<{ ok: boolean; value_masked?: string | null }>("save_contact", {
      p: {
        contact_id: contactId || null,
        customer_id: customerId,
        contact_type: "PHONE",
        value,
        is_primary: true,
        is_active: true,
      },
    });

    revalidatePath(PAGE);
    return {
      ok: true,
      title: contactId ? "แก้เบอร์โทรศัพท์แล้ว" : "เพิ่มเบอร์โทรศัพท์แล้ว",
      detail: result?.value_masked ? `เบอร์ที่บันทึก (ปิดบัง): ${result.value_masked}` : null,
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------ INCOMPLETE_CUSTOMER · เติมข้อมูล */

/**
 * เติมนามสกุลหรือจังหวัดให้ลูกค้า
 *
 * เงื่อนไขของปัญหานี้คือ "ขาดนามสกุล **และ** ขาดจังหวัด **และ** ไม่มีความสนใจ" (ข้อ 12.3)
 * เติมช่องใดช่องหนึ่งก็พ้นเงื่อนไขแล้ว จึงบังคับแค่ว่าต้องกรอกอย่างน้อยหนึ่งช่อง
 * เขียนลงตารางตรงเพราะ schema api ไม่มี RPC แก้ช่องของลูกค้า — 0010_security.sql เปิด
 * GRANT UPDATE เฉพาะคอลัมน์ชุดนี้ และ POLICY customers_update ตรวจสิทธิ์ customer.update ให้
 */
export async function completeCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const customerId = text(formData, "customer_id");
    const lastName = text(formData, "last_name");
    const province = text(formData, "province_code");
    if (!customerId) return { ok: false, title: "ไม่พบลูกค้ารายนี้" };
    if (!lastName && !province) {
      return { ok: false, title: "กรอกนามสกุลหรือเลือกจังหวัดอย่างน้อยหนึ่งช่อง" };
    }

    const payload: Record<string, unknown> = {};
    if (lastName) payload.last_name = lastName;
    if (province) payload.province_code = province;

    const db = await getDb();
    const { data, error } = await db
      .schema("crm")
      .from("customers")
      .update(payload)
      .eq("id", customerId)
      .select("id");
    if (error) throw error;
    assertWritten("crm.customers", data);

    revalidatePath(PAGE);
    return { ok: true, title: "เติมข้อมูลลูกค้าแล้ว", detail: "ระบบบันทึกประวัติการแก้ไขไว้แล้ว" };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------- LEAD_WITHOUT_OUTCOME · ปิด Lead */

/**
 * ปิด Lead ที่ค้างว่า "ไม่สำเร็จ"
 *
 * Lead ที่เปิดค้างเกินกำหนดหลุดจากรายการได้สองทาง: แปลงเป็นโอกาสขาย (api.convert_lead ซึ่งอยู่ในหน้าอื่น)
 * หรือปิดเป็น LOST · CHECK ของตารางบังคับว่า LOST ต้องมีทั้ง lost_reason_code และ closed_at
 * เวลาที่ใช้ปิดอ่านจาก app.clock() ผ่าน RPC ไม่ใช่นาฬิกาของเครื่อง (ข้อ 1.2)
 */
export async function closeLeadLost(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const leadId = text(formData, "lead_id");
    const reasonCode = text(formData, "lost_reason_code");
    const note = text(formData, "lost_note");
    if (!leadId) return { ok: false, title: "ไม่พบ Lead นี้" };
    if (!reasonCode) return { ok: false, title: "เลือกเหตุผลที่ไม่สำเร็จก่อน" };
    /* เหตุผล "อื่น ๆ" บังคับหมายเหตุที่ระดับ CHECK — บอกตั้งแต่ตรงนี้ดีกว่าให้ฐานข้อมูลตอบเป็นชื่อ constraint */
    if (reasonCode === "OTHER" && !note) {
      return { ok: false, title: "เหตุผล “อื่น ๆ” ต้องระบุหมายเหตุด้วย" };
    }

    const clock = await systemClock();
    const db = await getDb();
    const { data, error } = await db
      .schema("crm")
      .from("leads")
      .update({ status: "LOST", lost_reason_code: reasonCode, lost_note: note || null, closed_at: clock })
      .eq("id", leadId)
      .select("id");
    if (error) throw error;
    assertWritten("crm.leads", data);

    revalidatePath(PAGE);
    return { ok: true, title: "ปิด Lead ว่าไม่สำเร็จแล้ว", detail: "ระบบบันทึกประวัติสถานะพร้อมเหตุผลไว้แล้ว" };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------ OVERDUE_FOLLOWUP · ปิดงาน */

/**
 * ปิดงานติดตามที่เลยกำหนด
 *
 * trigger ตั้ง completed_at ให้เองเมื่อสถานะเป็น DONE (ข้อ 4.7) จึงส่งแค่สถานะ
 * OPEN → DONE และ IN_PROGRESS → DONE เป็นการเปลี่ยนที่ app.enforce_row_transition อนุญาต
 */
export async function completeTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const taskId = text(formData, "task_id");
    if (!taskId) return { ok: false, title: "ไม่พบงานนี้" };

    const db = await getDb();
    const { data, error } = await db
      .schema("crm")
      .from("tasks")
      .update({ status: "DONE" })
      .eq("id", taskId)
      .select("id");
    if (error) throw error;
    assertWritten("crm.tasks", data);

    revalidatePath(PAGE);
    return { ok: true, title: "ปิดงานติดตามแล้ว", detail: "ระบบบันทึกเวลาที่ทำเสร็จให้อัตโนมัติ" };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- WON_WITHOUT_TRANSACTION · ผูกเลขธุรกรรม */

/**
 * ผูกเลขธุรกรรมกับโอกาสขายที่ปิดการขายแล้ว (ข้อ 5.7 · 6.10)
 *
 * V1 ผูกด้วยมืออย่างเดียว ระบบต้นทางจึงเป็น MANUAL เสมอ และไม่มี RPC ให้เรียก —
 * POLICY transaction_refs_insert ของ 0010_security.sql เป็นด่านตรวจสิทธิ์ transaction.link
 * วันเวลาที่ผู้ใช้กรอกเป็นเวลาไทยตามที่หน้าจอแสดง จึงต่อ +07:00 ให้ชัด ไม่ปล่อยให้เดาเป็น UTC
 */
export async function linkTransaction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const opportunityId = text(formData, "opportunity_id");
    const customerId = text(formData, "customer_id");
    const branchId = text(formData, "branch_id");
    const typeCode = text(formData, "transaction_type_code");
    const externalNo = text(formData, "external_no");
    const transactedAt = text(formData, "transacted_at");
    const amount = text(formData, "amount");

    if (!opportunityId || !customerId || !branchId) return { ok: false, title: "ไม่พบโอกาสขายนี้" };
    if (!typeCode) return { ok: false, title: "เลือกประเภทธุรกรรมก่อน" };
    if (!externalNo) return { ok: false, title: "กรอกเลขธุรกรรมก่อน" };
    if (/\s/.test(externalNo)) return { ok: false, title: "เลขธุรกรรมต้องไม่มีช่องว่าง" };
    /* ต่อ ":00+07:00" ได้ต่อเมื่อค่าที่ได้เป็น "YYYY-MM-DDTHH:MM" เป๊ะ
       เบราว์เซอร์/ระบบปฏิบัติการบางตัวส่งวินาทีมาด้วย ("…THH:MM:SS") ซึ่งต่อท้ายแล้วจะกลายเป็น
       timestamp ที่ Postgres อ่านไม่ออก — ตรวจรูปแบบที่นี่เพื่อให้ผู้ใช้ได้ข้อความที่แก้ได้
       แทนชื่อชนิดข้อมูลดิบของฐานข้อมูล (วิธีเดียวกับ settings/value.ts · localToIso) */
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(transactedAt)) {
      return { ok: false, title: "ระบุวันเวลาที่ทำธุรกรรมให้ครบ (วัน เดือน ปี และเวลาเป็นชั่วโมง:นาที)" };
    }

    const db = await getDb();
    const { data, error } = await db
      .schema("crm")
      .from("transaction_refs")
      .insert({
        customer_id: customerId,
        branch_id: branchId,
        opportunity_id: opportunityId,
        transaction_type_code: typeCode,
        source_system_code: "MANUAL",
        external_no: externalNo,
        transacted_at: `${transactedAt}:00+07:00`,
        amount: amount === "" ? null : Number(amount),
      })
      .select("id");
    if (error) throw error;
    assertWritten("crm.transaction_refs", data);

    revalidatePath(PAGE);
    return {
      ok: true,
      title: "ผูกเลขธุรกรรมแล้ว",
      detail: "โอกาสขายรายนี้จะหลุดจากรายการ “ปิดขายแต่ไม่มีเลขธุรกรรม”",
    };
  } catch (e) {
    return fail(e);
  }
}
