import "server-only";

import type { Route } from "next";
import { cache } from "react";

import { rpc } from "@/lib/db";

/* บริบทผู้ใช้ปัจจุบัน — มาจาก api.get_my_access() เท่านั้น (Identity Contract IC-2)

   ใช้เพื่อ "แสดงผล" เท่านั้น: ซ่อนเมนู ซ่อนปุ่ม เลือกหน้าแรก
   ห้ามใช้ตัดสินว่าข้อมูลไหนส่งให้ผู้ใช้ได้ — ฐานข้อมูลเป็นผู้ตัดสินด้วย RLS อยู่แล้ว
   (CANONICAL ข้อ 9.6 · architecture §6.3 ขั้นที่ 3) */

export type Scope = "OWN" | "TEAM" | "BRANCH" | "ORGANIZATION" | "SYSTEM";

export type AccessStaff = {
  staff_id: string;
  staff_code: string;
  display_name: string;
  nickname: string | null;
  email: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  organization_id: string;
  invite_expires_at: string | null;
};

export type AccessRole = {
  role_code: string;
  rank: number;
  branch_id: string | null;
  branch_code: string | null;
  requires_mfa: boolean;
  effective_now: boolean;
};

export type AccessBranch = { branch_id: string; code: string; name_th: string };

export type AccessPermission = {
  permission_code: string;
  scope: Scope;
  branch_id: string | null;
  requires_mfa: boolean;
  requires_aal2: boolean;
  effective_now: boolean;
};

export type Access = {
  ok: boolean;
  aal: "aal1" | "aal2";
  staff: AccessStaff;
  roles: AccessRole[];
  branches: AccessBranch[];
  permissions: AccessPermission[];
  unread_notifications: number;
};

/** อ่านบริบทผู้ใช้ — เรียกได้หลายที่ใน request เดียว ยิงฐานข้อมูลครั้งเดียว */
export const getAccess = cache(async (): Promise<Access | null> => {
  const data = await rpc<Access | null>("get_my_access");
  return data && data.ok ? data : null;
});

/** เหมือน getAccess แต่บังคับว่าต้องมีผู้ใช้ — ใช้ในหน้าที่ผ่าน proxy มาแล้ว */
export async function requireAccess(): Promise<Access> {
  const access = await getAccess();
  if (!access) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  return access;
}

/** มีสิทธิ์นี้อยู่จริงในขณะนี้หรือไม่ (นับเฉพาะสิทธิ์ที่ effective_now) */
export function can(access: Access | null, permission: string, branchId?: string | null): boolean {
  if (!access) return false;
  return access.permissions.some(
    (p) =>
      p.permission_code === permission &&
      p.effective_now &&
      (branchId == null || p.branch_id == null || p.branch_id === branchId)
  );
}

/** มีสิทธิ์นี้แต่ยังติดเงื่อนไข MFA — ใช้บอกผู้ใช้ว่า "ยืนยันตัวตนก่อน" แทนที่จะซ่อนปุ่มเฉย ๆ */
export function needsMfaFor(access: Access | null, permission: string): boolean {
  if (!access) return false;
  return access.permissions.some(
    (p) => p.permission_code === permission && !p.effective_now && (p.requires_mfa || p.requires_aal2)
  );
}

export function hasRole(access: Access | null, ...roles: string[]): boolean {
  if (!access) return false;
  return access.roles.some((r) => roles.includes(r.role_code));
}

/** บทบาทที่สูงที่สุดของผู้ใช้ (rank มากกว่า = สูงกว่า) */
export function topRole(access: Access | null): AccessRole | null {
  if (!access || access.roles.length === 0) return null;
  return access.roles.reduce((best, r) => (r.rank > best.rank ? r : best));
}

/** สาขาที่ใช้เป็นค่าตั้งต้นของหน้าจอ — สาขาเดียวก็ใช้สาขานั้น */
export function defaultBranch(access: Access | null): AccessBranch | null {
  if (!access || access.branches.length === 0) return null;
  return access.branches[0] ?? null;
}

/** หน้าแรกหลังเข้าสู่ระบบ (architecture §6.1) */
export function homePath(access: Access | null): Route {
  /* SYSTEM_ADMIN ไม่มีสิทธิ์ข้อมูลลูกค้า หน้าแรกจึงเป็นหน้าตั้งค่าระบบ (architecture §6.1)
     หน้า /settings อยู่ในชุดที่ 2 — ระหว่างนี้ส่งไปหน้าหลักซึ่งอธิบายสถานะให้ */
  return "/dashboard";
}
