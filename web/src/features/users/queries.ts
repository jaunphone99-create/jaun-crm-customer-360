import "server-only";

import { getDb, rpc } from "@/lib/db";

import {
  ASSIGNABLE_ROLES,
  type AssignOption,
  type BranchRow,
  type GrantRequestRow,
  type RoleCatalogRow,
  type StaffRow,
} from "./types";

/* การอ่านข้อมูลของหน้า 13

   ทุกอย่างอ่านผ่าน RPC หรือตารางที่ RLS เปิดให้อ่านอยู่แล้ว — ไม่มีการเดาข้อมูลจากฝั่งแอป
   ฐานข้อมูลทดลองในเครื่องไม่รองรับ select แบบฝังตาราง จึง query แยกแล้วต่อกันในโค้ด
   (core.branches และ core.roles เป็นตารางอ้างอิงเล็ก ๆ อ่านครั้งเดียวต่อการโหลดหน้า) */

/** รายชื่อพนักงานในขอบเขตของผู้เรียก (api.list_staff ตัดสินว่าใครเห็นใคร) */
export async function loadStaff(status?: string | null): Promise<StaffRow[]> {
  const data = await rpc<{ ok: boolean; staff: StaffRow[] }>("list_staff", {
    p: status ? { status } : {},
  });
  return data?.staff ?? [];
}

/** สาขาทั้งหมดที่อ่านได้ — ใช้แปลง branch_id ของ assignment เป็นชื่อสาขาที่คนอ่านรู้เรื่อง */
export async function loadBranches(): Promise<BranchRow[]> {
  const db = await getDb();
  const { data, error } = await db.schema("core").from("branches").select("id,code,name_th").order("code");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    branch_id: String(b.id),
    code: String(b.code),
    name_th: String(b.name_th),
  }));
}

/** แคตตาล็อกบทบาท — rank และ is_branch_role มาจากฐานข้อมูล ห้ามเขียนทับในโค้ด (ข้อ 7) */
export async function loadRoleCatalog(): Promise<RoleCatalogRow[]> {
  const db = await getDb();
  const { data, error } = await db
    .schema("core")
    .from("roles")
    .select("code,rank,is_branch_role,requires_mfa,sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    code: String(r.code),
    rank: r.rank === null ? null : Number(r.rank),
    is_branch_role: Boolean(r.is_branch_role),
    requires_mfa: Boolean(r.requires_mfa),
    sort_order: Number(r.sort_order),
  }));
}

/** คำขอมอบบทบาท — RPC กรองให้เองว่าผู้เรียกเห็นคำขอไหนได้บ้าง */
export async function loadGrantRequests(): Promise<GrantRequestRow[]> {
  const data = await rpc<{ ok: boolean; requests: GrantRequestRow[] }>("list_role_grant_requests", { p: {} });
  return data?.requests ?? [];
}

/**
 * บทบาทที่ "ฐานข้อมูลยืนยันแล้วว่ามอบได้" สำหรับเป้าหมายรายนี้ (null = บัญชีที่ยังไม่ถูกสร้าง คือตอนเชิญ)
 *
 * ถาม api.can_assign_role ทีละคู่ (บทบาท × สาขา) แทนที่จะคัดจากตารางในโค้ด
 * เพราะกติกาการมอบบทบาทอยู่ใน app.assign_role_denial ที่เดียว และมีเงื่อนไขที่หน้าจอไม่รู้
 * เช่น เป้าหมายเป็น SYSTEM_ADMIN อยู่ หรือยังไม่ได้ยืนยันตัวตนกับ HR
 *
 * จำนวนคำถามถูกจำกัดโดยสาขาที่ผู้เรียกมีสิทธิ์อยู่แล้ว (ผู้จัดการสาขา = สาขาเดียว)
 */
export async function loadAssignOptions(
  targetStaffId: string | null,
  branches: BranchRow[],
  catalog: RoleCatalogRow[]
): Promise<AssignOption[]> {
  const candidates: AssignOption[] = [];
  for (const code of ASSIGNABLE_ROLES) {
    const role = catalog.find((r) => r.code === code);
    if (!role) continue;
    if (role.is_branch_role) {
      for (const b of branches) {
        candidates.push({ role_code: code, branch_id: b.branch_id, branch_label: b.name_th });
      }
    } else {
      candidates.push({ role_code: code, branch_id: null, branch_label: null });
    }
  }

  const answers = await Promise.all(
    candidates.map((c) =>
      rpc<boolean>("can_assign_role", {
        p_target_staff_id: targetStaffId,
        p_role_code: c.role_code,
        p_branch_id: c.branch_id,
      }).catch(() => false)
    )
  );

  return candidates.filter((_c, i) => answers[i] === true);
}
