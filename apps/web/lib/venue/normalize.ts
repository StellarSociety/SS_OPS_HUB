import type { Venue } from "@/lib/types/database";

export function normalizeVenueRow(row: Record<string, unknown>): Venue {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    is_global: Boolean(row.is_global),
    primary_color: String(row.primary_color),
    secondary_color: String(row.secondary_color),
    logo_url: (row.logo_url as string | null) ?? null,
    icon_url: (row.icon_url as string | null) ?? null,
    favicon_url: (row.favicon_url as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export function normalizeVenueRows(rows: Record<string, unknown>[]): Venue[] {
  return rows.map(normalizeVenueRow);
}
