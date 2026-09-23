import "server-only";

import type { Access } from "@/lib/access";

import type { DetailContext } from "./IssueDetail";
import {
  loadAssignCandidates,
  loadChannels,
  loadCustomers,
  loadDuplicateDetails,
  loadLeads,
  loadLostReasons,
  loadOpportunities,
  loadOwnershipReasons,
  loadPhones,
  loadProvinces,
  loadStaffNames,
  loadTasks,
  loadTransactionTypes,
  loadVisits,
} from "./queries";
import type {
  CustomerBrief,
  DuplicateDetail,
  IssueCode,
  IssueRow,
  LeadBrief,
  OpportunityBrief,
  PhoneBrief,
  RefOption,
  StaffOption,
  TaskBrief,
  VisitBrief,
} from "./types";

/* ประกอบข้อมูลที่รายละเอียดของชนิดปัญหาหนึ่งต้องใช้

   อ่านเฉพาะสิ่งที่ชนิดนั้นใช้จริง และเฉพาะแถวที่กำลังจะแสดงบนจอ
   ถ้าอ่านทุกตารางทุกครั้ง หน้าจะยิงคำถามที่ไม่มีใครดูผลลัพธ์ไปเปล่า ๆ สิบกว่าครั้งต่อการโหลดหนึ่งครั้ง

   แถวที่ RLS ไม่ให้อ่านรายละเอียดจะไม่อยู่ใน Map ที่ได้ — หน้าจอแสดงขีดและบอกว่าอยู่นอกขอบเขต
   ไม่ใช่ซ่อนแถวทิ้ง เพราะตัวนับของ RPC ยังนับแถวนั้นอยู่ ถ้าซ่อนผู้ใช้จะงงว่าเลขไม่ตรงกับที่เห็น */

/** Map ว่างที่มีชนิดตรงกับปลายทาง — ใช้กับสาขาของ Promise.all ที่ชนิดนั้นไม่ต้องอ่าน */
function none<T>(): Promise<Map<string, T>> {
  return Promise.resolve(new Map<string, T>());
}

export async function loadDetailContext(
  access: Access,
  code: IssueCode,
  rows: IssueRow[],
  branchNames: Record<string, string>,
  branchId: string | null
): Promise<DetailContext> {
  const entityIds = rows.map((r) => r.entity_id);
  const customerIds = rows.map((r) => r.customer_id).filter((v): v is string => v !== null);
  const staffIds = rows.map((r) => r.owner_staff_id).filter((v): v is string => v !== null);

  const needsCustomers = code !== "DUPLICATE_SUSPECTED";
  const needsPhones = code === "MISSING_PHONE" || code === "INVALID_PHONE" || code === "DUPLICATE_SUSPECTED";
  const needsChannels = code === "MISSING_PHONE" || code === "LEAD_WITHOUT_OWNER";
  const needsProvinces = code === "INCOMPLETE_CUSTOMER" || code === "DUPLICATE_SUSPECTED";

  const [customers, duplicates, leads, tasks, opportunities, visits] = await Promise.all([
    needsCustomers ? loadCustomers(customerIds) : none<CustomerBrief>(),
    code === "DUPLICATE_SUSPECTED" ? loadDuplicateDetails(entityIds) : none<DuplicateDetail>(),
    code === "LEAD_WITHOUT_OWNER" || code === "LEAD_WITHOUT_OUTCOME" ? loadLeads(entityIds) : none<LeadBrief>(),
    code === "OVERDUE_FOLLOWUP" ? loadTasks(entityIds) : none<TaskBrief>(),
    code === "WON_WITHOUT_TRANSACTION" ? loadOpportunities(entityIds) : none<OpportunityBrief>(),
    code === "VISIT_UNRECORDED" ? loadVisits(entityIds) : none<VisitBrief>(),
  ]);

  /* คู่ลูกค้าซ้ำแสดงชื่อผู้สร้างแถวด้วย จึงต้องรวม id ชุดนั้นเข้ามาก่อนถามชื่อพนักงานครั้งเดียว */
  const extraStaff = [...duplicates.values()].map((d) => d.created_by).filter((v): v is string => v !== null);
  const leadOwners = [...leads.values()].map((l) => l.owner_staff_id).filter((v): v is string => v !== null);

  const [staffNames, phones, channels, provinces, lostReasons, ownershipReasons, transactionTypes, assignCandidates] =
    await Promise.all([
      loadStaffNames([...staffIds, ...extraStaff, ...leadOwners]),
      needsPhones
        ? loadPhones(
            code === "DUPLICATE_SUSPECTED"
              ? [...duplicates.values()].flatMap((d) => [d.newer?.id, d.existing?.id]).filter((v): v is string => !!v)
              : customerIds
          )
        : none<PhoneBrief[]>(),
      needsChannels ? loadChannels() : Promise.resolve([] as RefOption[]),
      needsProvinces ? loadProvinces() : Promise.resolve([] as RefOption[]),
      code === "LEAD_WITHOUT_OUTCOME" ? loadLostReasons() : Promise.resolve([] as RefOption[]),
      code === "LEAD_WITHOUT_OWNER" ? loadOwnershipReasons() : Promise.resolve([] as RefOption[]),
      code === "WON_WITHOUT_TRANSACTION" ? loadTransactionTypes() : Promise.resolve([] as RefOption[]),
      code === "LEAD_WITHOUT_OWNER" ? loadAssignCandidates(branchId) : Promise.resolve([] as StaffOption[]),
    ]);

  const channelLabels: Record<string, string> = {};
  for (const c of channels) channelLabels[c.code] = c.label;
  const provinceLabels: Record<string, string> = {};
  for (const p of provinces) provinceLabels[p.code] = p.label;

  return {
    access,
    branchNames,
    customers,
    phones,
    staffNames,
    duplicates,
    leads,
    tasks,
    opportunities,
    visits,
    channelLabels,
    provinceLabels,
    provinces,
    lostReasons,
    ownershipReasons,
    transactionTypes,
    assignCandidates,
  };
}
