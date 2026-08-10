import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Account,
  Dimension,
  DimensionRequirement,
  DimensionValue,
  DocumentSequence,
  FiscalPeriod,
  LegalEntity,
  SystemDefaultAccount,
  VenueEntity,
} from "./types";

type Client = SupabaseClient;

export async function listLegalEntities(client: Client): Promise<LegalEntity[]> {
  const { data, error } = await client
    .from("legal_entities")
    .select("*")
    .order("entity_code");
  if (error) throw new Error(error.message);
  return (data ?? []) as LegalEntity[];
}

export async function listVenueEntities(client: Client): Promise<VenueEntity[]> {
  const { data, error } = await client
    .from("venue_entities")
    .select(
      "*, legal_entities(id, entity_code, name, trn), venues(id, slug, name)",
    )
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as VenueEntity[];
}

export async function listFiscalPeriods(
  client: Client,
  entityId: string,
): Promise<FiscalPeriod[]> {
  const { data, error } = await client
    .from("fiscal_periods")
    .select("*")
    .eq("entity_id", entityId)
    .order("period");
  if (error) throw new Error(error.message);
  return (data ?? []) as FiscalPeriod[];
}

export async function listAccounts(client: Client): Promise<Account[]> {
  const { data, error } = await client
    .from("accounts")
    .select("*")
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

export async function listDimensions(client: Client): Promise<Dimension[]> {
  const { data, error } = await client
    .from("dimensions")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Dimension[];
}

export async function listDimensionRequirements(
  client: Client,
): Promise<DimensionRequirement[]> {
  const { data, error } = await client
    .from("dimension_requirements")
    .select("*")
    .order("account_range_from");
  if (error) throw new Error(error.message);
  return (data ?? []) as DimensionRequirement[];
}

export async function listDimensionValues(
  client: Client,
  dimensionId?: string,
): Promise<DimensionValue[]> {
  let query = client
    .from("dimension_values")
    .select("*")
    .order("sort_order");
  if (dimensionId) query = query.eq("dimension_id", dimensionId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as DimensionValue[];
}

export async function listSystemDefaultAccounts(
  client: Client,
): Promise<SystemDefaultAccount[]> {
  const { data, error } = await client
    .from("system_default_accounts")
    .select("*, accounts(id, code, name)")
    .order("key");
  if (error) throw new Error(error.message);
  return (data ?? []) as SystemDefaultAccount[];
}

export async function listSequences(
  client: Client,
  entityId?: string,
): Promise<DocumentSequence[]> {
  let query = client.from("sequences").select("*").order("doc_type");
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentSequence[];
}

export async function listVenuesForMapping(
  client: Client,
): Promise<{ id: string; slug: string; name: string }[]> {
  const { data, error } = await client
    .from("venues")
    .select("id, slug, name")
    .eq("is_global", false)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
