"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";

async function runAction<T extends { ok: boolean; error?: string }>(
  action: () => Promise<T>,
  successMessage: string,
): Promise<T | null> {
  try {
    const result = await action();
    if (!result.ok) {
      toast.error(result.error ?? "Something went wrong.");
      return null;
    }
    toast.saved(successMessage);
    return result;
  } catch {
    toast.error("Network error — check your connection and try again.");
    return null;
  }
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  upsertLegalEntity,
  upsertVenueEntity,
} from "@/lib/actions/accounting-settings";
import {
  EMIRATE_OPTIONS,
  type FiscalPeriod,
  type LegalEntity,
  type VenueEntity,
} from "@/lib/accounting/types";

type VenueOption = { id: string; slug: string; name: string };

type Props = {
  entities: LegalEntity[];
  venueEntities: VenueEntity[];
  venues: VenueOption[];
  periodsByEntity: Record<string, FiscalPeriod[]>;
  canEdit: boolean;
};

const fieldClass = "space-y-1.5";
const labelClass = "text-xs font-medium text-[#3D421F]";
const selectClass =
  "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

function emptyEntity(): Partial<LegalEntity> {
  return {
    entity_code: "",
    name: "",
    trn: "",
    trade_licence_no: "",
    licensing_authority: "",
    emirate: "dubai",
    vat_filing_frequency: "monthly",
    first_open_period: "2026-01-01",
    fiscal_year_start_month: 1,
  };
}

export function EntitiesSettingsSection({
  entities,
  venueEntities,
  venues,
  periodsByEntity,
  canEdit,
}: Props) {
  const [selectedId, setSelectedId] = useState(entities[0]?.id ?? "");
  const [draft, setDraft] = useState<Partial<LegalEntity>>(
    entities[0] ?? emptyEntity(),
  );
  const [pending, startTransition] = useTransition();

  function selectEntity(id: string) {
    setSelectedId(id);
    const found = entities.find((e) => e.id === id);
    setDraft(found ?? emptyEntity());
  }

  function startNew() {
    setSelectedId("");
    setDraft(emptyEntity());
  }

  function saveEntity() {
    const fd = new FormData();
    if (selectedId) fd.set("id", selectedId);
    fd.set("entity_code", draft.entity_code ?? "");
    fd.set("name", draft.name ?? "");
    fd.set("trn", draft.trn ?? "");
    fd.set("trade_licence_no", draft.trade_licence_no ?? "");
    fd.set("licensing_authority", draft.licensing_authority ?? "");
    fd.set("emirate", draft.emirate ?? "dubai");
    fd.set("vat_filing_frequency", draft.vat_filing_frequency ?? "monthly");
    fd.set("first_open_period", draft.first_open_period ?? "");
    fd.set(
      "fiscal_year_start_month",
      String(draft.fiscal_year_start_month ?? 1),
    );

    startTransition(async () => {
      const result = await runAction(() => upsertLegalEntity(fd), "Legal entity saved");
      if (result && "id" in result && result.id) setSelectedId(result.id);
    });
  }

  function saveVenueMap(ve: VenueEntity | null, venueId: string) {
    const fd = new FormData();
    if (ve?.id) fd.set("id", ve.id);
    fd.set("venue_id", venueId);
    fd.set("entity_id", selectedId || (entities[0]?.id ?? ""));
    fd.set(
      "emirate_of_supply",
      ve?.emirate_of_supply ?? draft.emirate ?? "dubai",
    );
    fd.set("notes", ve?.notes ?? "");

    if (!fd.get("entity_id")) {
      toast.error("Save a legal entity first.");
      return;
    }

    startTransition(async () => {
      await runAction(() => upsertVenueEntity(fd), "Venue mapping saved");
    });
  }

  const periods = selectedId ? (periodsByEntity[selectedId] ?? []) : [];
  const mappedVenueIds = new Set(venueEntities.map((v) => v.venue_id));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-[#3D421F]">
            Legal entities
          </h2>
          <p className="mt-1 text-sm text-black/55">
            One entity per TRN. Fill real licence details here — nothing below
            is hardcoded in posting logic.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" variant="secondary" onClick={startNew}>
            Add entity
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <ul className="space-y-1">
          {entities.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => selectEntity(e.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  selectedId === e.id
                    ? "bg-[var(--venue-primary,#808A3E)]/15 font-medium text-[#3D421F]"
                    : "text-black/70 hover:bg-black/[0.04]"
                }`}
              >
                <span className="block">{e.entity_code}</span>
                <span className="block truncate text-xs text-black/45">
                  {e.name}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="space-y-4 rounded-lg border border-black/10 bg-white/70 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="entity_code">
                Entity code
              </label>
              <Input
                id="entity_code"
                value={draft.entity_code ?? ""}
                disabled={!canEdit || Boolean(selectedId)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, entity_code: e.target.value }))
                }
              />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="name">
                Legal name
              </label>
              <Input
                id="name"
                value={draft.name ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="trn">
                TRN (15 digits)
              </label>
              <Input
                id="trn"
                value={draft.trn ?? ""}
                disabled={!canEdit}
                placeholder="Leave blank until confirmed"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, trn: e.target.value }))
                }
              />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="trade_licence_no">
                Trade licence no.
              </label>
              <Input
                id="trade_licence_no"
                value={draft.trade_licence_no ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    trade_licence_no: e.target.value,
                  }))
                }
              />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="licensing_authority">
                Licensing authority
              </label>
              <Input
                id="licensing_authority"
                value={draft.licensing_authority ?? ""}
                disabled={!canEdit}
                placeholder="DED / free zone"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    licensing_authority: e.target.value,
                  }))
                }
              />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="emirate">
                Emirate of registration
              </label>
              <select
                id="emirate"
                className={selectClass}
                disabled={!canEdit}
                value={draft.emirate ?? "dubai"}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    emirate: e.target.value as LegalEntity["emirate"],
                  }))
                }
              >
                {EMIRATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="vat_filing_frequency">
                VAT filing frequency
              </label>
              <select
                id="vat_filing_frequency"
                className={selectClass}
                disabled={!canEdit}
                value={draft.vat_filing_frequency ?? "monthly"}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    vat_filing_frequency: e.target
                      .value as LegalEntity["vat_filing_frequency"],
                  }))
                }
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="first_open_period">
                First open period
              </label>
              <Input
                id="first_open_period"
                type="month"
                disabled={!canEdit}
                value={(draft.first_open_period ?? "").slice(0, 7)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    first_open_period: e.target.value
                      ? `${e.target.value}-01`
                      : "",
                  }))
                }
              />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="fy_start">
                Financial year start month
              </label>
              <select
                id="fy_start"
                className={selectClass}
                disabled={!canEdit}
                value={draft.fiscal_year_start_month ?? 1}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    fiscal_year_start_month: Number(e.target.value),
                  }))
                }
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1, 1).toLocaleString("en-GB", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {canEdit ? (
            <Button type="button" disabled={pending} onClick={saveEntity}>
              {pending ? "Saving…" : "Save entity"}
            </Button>
          ) : null}

          {selectedId ? (
            <div className="border-t border-black/10 pt-4">
              <h3 className="text-sm font-medium text-[#3D421F]">
                Open fiscal periods ({periods.length})
              </h3>
              <p className="mt-1 text-xs text-black/45">
                Period close lands in a later phase. All seeded months start
                open.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {periods.map((p) => (
                  <span
                    key={p.id}
                    className="rounded border border-black/10 px-2 py-0.5 text-xs text-black/65"
                  >
                    {p.period.slice(0, 7)} · {p.status}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-serif text-xl font-semibold text-[#3D421F]">
          Venue → entity mapping
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2 font-medium">Venue</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Emirate of supply</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => {
                const ve = venueEntities.find((x) => x.venue_id === v.id) ?? null;
                return (
                  <tr key={v.id} className="border-t border-black/5">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[#3D421F]">{v.name}</div>
                      <div className="text-xs text-black/45">{v.slug}</div>
                    </td>
                    <td className="px-3 py-2 text-black/70">
                      {ve?.legal_entities
                        ? `${ve.legal_entities.entity_code} — ${ve.legal_entities.name}`
                        : mappedVenueIds.has(v.id)
                          ? "—"
                          : "Unmapped"}
                    </td>
                    <td className="px-3 py-2">
                      {ve ? (
                        <select
                          className={selectClass}
                          disabled={!canEdit}
                          defaultValue={ve.emirate_of_supply}
                          onChange={(e) => {
                            const next = {
                              ...ve,
                              emirate_of_supply: e.target
                                .value as VenueEntity["emirate_of_supply"],
                            };
                            saveVenueMap(next, v.id);
                          }}
                        >
                          {EMIRATE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-black/45">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!ve && canEdit && selectedId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => saveVenueMap(null, v.id)}
                        >
                          Map to selected
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
