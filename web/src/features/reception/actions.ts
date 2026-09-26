"use server";

import { revalidatePath } from "next/cache";

import { requireAccess } from "@/lib/access";
import { getDb, rpc, RpcError } from "@/lib/db";

/* การกระทำทั้งหมดของหน้ารับลูกค้า

   ทุกตัวส่งต่อให้ฐานข้อมูลตัดสิน แอปไม่เช็คสิทธิ์เองก่อนแล้วคิดว่าพอ
   (ซ่อนปุ่มเป็นเรื่องความสะดวก · การปฏิเสธจริงเกิดที่ RLS และ RPC) */

export type ActionState = { ok: boolean; message: string | null; visitNo?: string | null };

const RECEPTION = "/reception";

function toState(e: unknown): ActionState {
  if (e instanceof RpcError) return { ok: false, message: e.message };
  if (e && typeof e === "object" && "message" in e) {
    return { ok: false, message: String((e as { message: unknown }).message) };
  }
  return { ok: false, message: "ทำรายการไม่สำเร็จ กรุณาลองใหม่" };
}

/** รับคิว: WAITING → IN_SERVICE พร้อมตั้งตัวเองเป็นผู้รับ
    service_started_at ให้ trigger ของฐานข้อมูลเติม (ข้อ 4.1) — แอปไม่มีสิทธิ์เขียนคอลัมน์นั้น */
export async function claimVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireAccess();
    const visitId = String(formData.get("visitId") ?? "");
    if (!visitId) return { ok: false, message: "ไม่พบคิวที่เลือก" };

    const supabase = await getDb();
    const { data, error } = await supabase
      .schema("crm")
      .from("visits")
      .update({ status: "IN_SERVICE", owner_staff_id: access.staff.staff_id })
      .eq("id", visitId)
      .eq("status", "WAITING")
      .select("id");
    if (error) throw error;

    revalidatePath(RECEPTION);
    if (!data || data.length !== 1) {
      return { ok: false, message: "รับคิวไม่สำเร็จ คิวนี้อาจมีผู้รับแล้วหรือคุณไม่มีสิทธิ์รับ กรุณาตรวจสอบคิวล่าสุด" };
    }
    return { ok: true, message: "รับคิวแล้ว" };
  } catch (e) {
    return toState(e);
  }
}

/** เปิด visit ใหม่ — ครอบคลุมทั้ง "รับเข้าคิว" "เริ่มให้บริการ" และ "รับลูกค้าด่วน" */
export async function openVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const access = await requireAccess();
    const branchCode = String(formData.get("branchCode") ?? "");
    const branch = access.branches.find((b) => b.code === branchCode) ?? access.branches[0];
    if (!branch) return { ok: false, message: "บัญชีนี้ยังไม่ได้ผูกกับสาขาใด" };

    /* ปุ่มที่ผู้ใช้กดบอกเจตนามาเอง (name="intent") — เชื่อถือได้กว่า state ฝั่ง client */
    const intent = String(formData.get("intent") ?? "service");
    const mode = intent === "queue" ? "QUEUE" : "SERVICE";
    const express = intent === "express";
    const interest = String(formData.get("interest_code") ?? "").trim();
    const source = String(formData.get("source_code") ?? "").trim();
    const partySize = Number(formData.get("party_size") ?? 1);
    const customerId = String(formData.get("customer_id") ?? "").trim();

    /* "รับลูกค้าด่วน" ต้องกดแล้วจบ ไม่บังคับกรอกอะไร — แต่ visit หน้าร้านต้องมีวัตถุประสงค์
       จึงใส่ "สอบถาม/โปรโมชั่น" ไว้ก่อนแล้วให้แก้ทีหลัง (Capture First–Enrich Later · ข้อ 6.2) */
    const interestCode = express ? interest || "INQUIRY" : interest;
    if (!express && !interestCode) return { ok: false, message: "เลือกวัตถุประสงค์หลักก่อน" };
    if (!Number.isFinite(partySize) || partySize < 1) return { ok: false, message: "จำนวนลูกค้าต้องไม่น้อยกว่า 1" };

    const result = await rpc<{ ok: boolean; visit_no?: string; queue_no?: number }>("open_visit", {
      p: {
        branch_id: branch.branch_id,
        channel_code: "WALK_IN",
        visit_mode: mode,
        interest_code: interestCode,
        source_code: source || null,
        party_size: partySize,
        customer_id: customerId || null,
      },
    });

    revalidatePath(RECEPTION);
    const queued = mode === "QUEUE";
    return {
      ok: true,
      visitNo: result?.visit_no ?? null,
      message: queued
        ? `รับเข้าคิวแล้ว${result?.queue_no ? ` · คิวที่ ${result.queue_no}` : ""}`
        : "เริ่มให้บริการแล้ว",
    };
  } catch (e) {
    return toState(e);
  }
}

/** ปิด visit พร้อมผล — ทุก visit ต้องจบด้วยผลอย่างใดอย่างหนึ่ง (ข้อ 4.2) */
export async function closeVisit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const visitId = String(formData.get("visitId") ?? "");
    const outcome = String(formData.get("outcome_code") ?? "");
    if (!visitId || !outcome) return { ok: false, message: "เลือกผลของการให้บริการก่อน" };

    await rpc("close_visit", { p_visit_id: visitId, p_outcome_code: outcome, p: {} });

    revalidatePath(RECEPTION);
    return { ok: true, message: "บันทึกผลแล้ว" };
  } catch (e) {
    return toState(e);
  }
}
