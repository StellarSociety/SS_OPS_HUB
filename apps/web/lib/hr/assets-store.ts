import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assetTypesForCatalog,
  filterAssetsForCatalog,
  findUniformAssetType,
} from "@/lib/hr/assets-catalog";
import { isOutEmploymentStatus } from "@/lib/hr/employment-status";
import { listPendingPayrollDeductionsForVenue } from "@/lib/hr/payroll/pending-deductions";
import {
  listAllStaff,
  listAssetTypes,
  listAssets,
  listDepartments,
  listEmploymentStatuses,
  listPositions,
} from "@/lib/hr/store";
import type {
  AssetReplacementRow,
  AssetStaffItemRow,
  AssetStaffSummaryRow,
  AssetType,
} from "@/lib/hr/types";

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function listAssetStaffItems(
  supabase: SupabaseClient,
  opts?: { staffId?: string; uniformTypeId?: string | null },
): Promise<AssetStaffItemRow[]> {
  let query = supabase
    .from("hr_asset_assignments")
    .select(
      `
      id,
      staff_id,
      asset_id,
      assigned_at,
      notes,
      asset:hr_assets(
        id,
        name,
        serial_no,
        asset_value,
        status,
        asset_type_id,
        asset_type:asset_types(id, name, sort_order)
      )
    `,
    )
    .is("returned_at", null)
    .order("assigned_at", { ascending: false });

  if (opts?.staffId) {
    query = query.eq("staff_id", opts.staffId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[hr] listAssetStaffItems:", error.message);
    return [];
  }

  const rows: AssetStaffItemRow[] = [];
  for (const raw of data ?? []) {
    const row = raw as {
      id: string;
      staff_id: string;
      asset_id: string;
      assigned_at: string;
      notes: string;
      asset:
        | {
            id: string;
            name: string;
            serial_no: string;
            asset_value: number | string;
            status: AssetStaffItemRow["status"];
            asset_type_id: string;
            asset_type: AssetType | AssetType[] | null;
          }
        | {
            id: string;
            name: string;
            serial_no: string;
            asset_value: number | string;
            status: AssetStaffItemRow["status"];
            asset_type_id: string;
            asset_type: AssetType | AssetType[] | null;
          }[]
        | null;
    };
    const asset = unwrapOne(row.asset);
    if (!asset) continue;
    if (
      opts?.uniformTypeId &&
      asset.asset_type_id === opts.uniformTypeId
    ) {
      continue;
    }
    rows.push({
      assignment_id: row.id,
      asset_id: row.asset_id,
      staff_id: row.staff_id,
      assigned_at: row.assigned_at,
      notes: row.notes ?? "",
      name: asset.name,
      serial_no: asset.serial_no ?? "",
      asset_value: Number(asset.asset_value ?? 0),
      status: asset.status,
      asset_type: unwrapOne(asset.asset_type),
    });
  }
  return rows;
}

export async function listAssetReplacements(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { staffId?: string },
): Promise<AssetReplacementRow[]> {
  let query = supabase
    .from("hr_asset_replacements")
    .select(
      `
      id,
      venue_id,
      staff_id,
      asset_id,
      assignment_id,
      replacement_asset_id,
      disposition,
      unit_value,
      charged_to_employee,
      deduction_amount,
      notes,
      pending_deduction_id,
      email_sent_at,
      created_at,
      asset:hr_assets!asset_id(name, serial_no),
      replacement_asset:hr_assets!replacement_asset_id(name),
      pending_deduction:hr_pending_payroll_deductions!pending_deduction_id(
        status,
        applied_run_id,
        amount,
        original_amount,
        remaining_amount
      )
    `,
    )
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });

  if (opts?.staffId) {
    query = query.eq("staff_id", opts.staffId);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    console.error("[hr] listAssetReplacements:", error.message);
    return [];
  }

  type PendingJoin = {
    status: string;
    applied_run_id: string | null;
    amount?: number | string | null;
    original_amount?: number | string | null;
    remaining_amount?: number | string | null;
  };

  return (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      venue_id: string;
      staff_id: string;
      asset_id: string;
      assignment_id: string | null;
      replacement_asset_id: string | null;
      disposition: "returned" | "lost";
      unit_value: number | string;
      charged_to_employee: boolean;
      deduction_amount: number | string;
      notes: string;
      pending_deduction_id: string | null;
      email_sent_at: string | null;
      created_at: string;
      asset:
        | { name: string; serial_no: string }
        | { name: string; serial_no: string }[]
        | null;
      replacement_asset: { name: string } | { name: string }[] | null;
      pending_deduction: PendingJoin | PendingJoin[] | null;
    };
    const asset = unwrapOne(row.asset);
    const replacement = unwrapOne(row.replacement_asset);
    const pending = unwrapOne(row.pending_deduction);
    const original = Number(
      pending?.original_amount ?? pending?.amount ?? row.deduction_amount ?? 0,
    );
    const remaining = Number(
      pending?.remaining_amount ??
        (pending?.status === "cleared" || pending?.status === "applied"
          ? 0
          : original),
    );
    return {
      id: row.id,
      venue_id: row.venue_id,
      staff_id: row.staff_id,
      asset_id: row.asset_id,
      assignment_id: row.assignment_id,
      replacement_asset_id: row.replacement_asset_id,
      disposition: row.disposition,
      unit_value: Number(row.unit_value ?? 0),
      charged_to_employee: Boolean(row.charged_to_employee),
      deduction_amount: Number(row.deduction_amount ?? 0),
      notes: row.notes ?? "",
      pending_deduction_id: row.pending_deduction_id,
      email_sent_at: row.email_sent_at,
      created_at: row.created_at,
      asset_name: asset?.name ?? null,
      asset_serial_no: asset?.serial_no ?? null,
      replacement_asset_name: replacement?.name ?? null,
      pending_deduction_status: (pending?.status as AssetReplacementRow["pending_deduction_status"]) ?? null,
      applied_run_id: pending?.applied_run_id ?? null,
      original_amount: original,
      remaining_amount: remaining,
      deducted_amount: Math.max(0, original - remaining),
      payroll_editable:
        pending?.status !== "applied" && pending?.status !== "cleared",
    } satisfies AssetReplacementRow;
  });
}

export async function listAssetStaffArchives(
  supabase: SupabaseClient,
  venueId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("hr_asset_staff_archives")
    .select("staff_id, archived_at")
    .eq("venue_id", venueId);

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return new Map();
    }
    console.error("[hr] listAssetStaffArchives:", error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.staff_id), String(row.archived_at));
  }
  return map;
}

export async function loadAssetsEmployeesPage(
  supabase: SupabaseClient,
  venueId: string,
) {
  const [allTypes, allAssets, staff, departments, positions, statuses] =
    await Promise.all([
      listAssetTypes(supabase),
      listAssets(supabase),
      listAllStaff(supabase),
      listDepartments(supabase, venueId),
      listPositions(supabase, venueId),
      listEmploymentStatuses(supabase),
    ]);

  const uniformType = findUniformAssetType(allTypes);
  const uniformTypeId = uniformType?.id ?? null;

  const [items, pending, replacements, archives] = await Promise.all([
    listAssetStaffItems(supabase, { uniformTypeId }),
    listPendingPayrollDeductionsForVenue(supabase, venueId, {
      status: "pending",
    }),
    listAssetReplacements(supabase, venueId),
    listAssetStaffArchives(supabase, venueId),
  ]);

  const itemsByStaff = new Map<string, AssetStaffItemRow[]>();
  for (const item of items) {
    const list = itemsByStaff.get(item.staff_id) ?? [];
    list.push(item);
    itemsByStaff.set(item.staff_id, list);
  }

  const pendingByStaff = new Map<string, number>();
  for (const row of pending) {
    if (row.source !== "asset_replacement") continue;
    const outstanding = Number(row.remaining_amount ?? row.amount ?? 0);
    if (!(outstanding > 0)) continue;
    pendingByStaff.set(
      row.staff_id,
      (pendingByStaff.get(row.staff_id) ?? 0) + outstanding,
    );
  }

  const replacementsByStaff = new Map<string, AssetReplacementRow[]>();
  for (const row of replacements) {
    const list = replacementsByStaff.get(row.staff_id) ?? [];
    list.push(row);
    replacementsByStaff.set(row.staff_id, list);
  }

  const availableAssets = filterAssetsForCatalog(
    allAssets,
    "assets",
    uniformTypeId,
  ).filter((asset) => asset.status === "available");

  const rows = staff.map((member) => {
    const memberItems = itemsByStaff.get(member.id) ?? [];
    const total_value = memberItems.reduce(
      (sum, item) => sum + Number(item.asset_value ?? 0),
      0,
    );
    const archivedAt = archives.get(member.id) ?? null;
    const hiddenByOut = isOutEmploymentStatus(
      member.employment_status?.name,
    );
    return {
      staff: member,
      items: memberItems,
      total_value,
      pending_deduction_total: pendingByStaff.get(member.id) ?? 0,
      replacements: replacementsByStaff.get(member.id) ?? [],
      archived: archivedAt != null || hiddenByOut,
      archived_at: archivedAt,
    } satisfies AssetStaffSummaryRow;
  });

  return {
    rows,
    availableAssets,
    assetTypes: assetTypesForCatalog(allTypes, "assets", uniformTypeId),
    staff,
    departments,
    positions,
    statuses,
  };
}
