import "server-only";

import { cache } from "react";

import { getDb, RpcError } from "@/lib/db";

import type { CaptureRefs, ChannelOption, InterestOption, RefOption } from "./types";

/* Master Data ของฟอร์ม Quick Capture — อ่านจาก schema `ref` เท่านั้น (CANONICAL ข้อ 5)
   แถวที่ is_active = false ไม่ต้องให้เลือกใหม่ · ลำดับใช้ sort_order ของฐานข้อมูล
   ห้ามพิมพ์รายการเหล่านี้ไว้ในโค้ด เพราะ Master Data แก้ได้จากหน้า "ตั้งค่า" */

async function refRows<T>(table: string, columns: string): Promise<T[]> {
  const db = await getDb();
  const { data, error } = await db
    .schema("ref")
    .from(table)
    .select(columns)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw RpcError.from(`ref.${table}`, error);
  return (data ?? []) as T[];
}

/** อ่านทุกตาราง lookup ที่หน้า 04 ใช้ — ครั้งเดียวต่อ request */
export const loadCaptureRefs = cache(async (): Promise<CaptureRefs> => {
  const [channels, interestTypes, productTypes, provinces, sources, overrideReasons, consentPurposes] =
    await Promise.all([
      refRows<ChannelOption>("channels", "code,label_th,is_live"),
      refRows<InterestOption>("interest_types", "code,label_th,creates_lead"),
      refRows<RefOption>("product_types", "code,label_th"),
      refRows<RefOption>("provinces", "code,label_th"),
      refRows<RefOption>("sources", "code,label_th"),
      refRows<RefOption>("duplicate_override_reasons", "code,label_th"),
      refRows<RefOption>("consent_purposes", "code,label_th"),
    ]);

  return { channels, interestTypes, productTypes, provinces, sources, overrideReasons, consentPurposes };
});
