"use client";

import { useEffect, useState } from "react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  getCurrentMonthKey,
} from "@/lib/sales/daily-sales-calculations";
import {
  getCurrentWeekFilterKey,
  getCurrentYearKey,
  type SalesTableDateFilters,
} from "@/lib/sales/sales-data-table-dates";
import {
  defaultFiguresAlertsFilters,
  defaultSalesEntryDate,
  defaultSalesInsightsFilters,
  defaultSalesTableDateFilters,
  readFiguresAlertsFilters,
  readSalesEntryDate,
  readSalesInsightsFilters,
  readSalesTableDateFilters,
  readSalesWaiterSelection,
  resolveMonthFilterForDisplay,
  salesFiltersStorageKey,
  SALES_ENTRY_DATE_KEY,
  SALES_FIGURES_ALERTS_FILTERS_KEY,
  SALES_INSIGHTS_FILTERS_KEY,
  SALES_TABLE_DATE_FILTERS_KEY,
  SALES_WAITER_SELECTION_KEY,
  writeFiguresAlertsFilters,
  writeSalesEntryDate,
  writeSalesInsightsFilters,
  writeSalesTableDateFilters,
  writeSalesWaiterSelection,
  type FiguresAlertsFilters,
  type FiguresAlertsPeriodMode,
  type SalesInsightsFilters,
  type SalesInsightsPeriodMode,
} from "@/lib/sales/sales-filters-storage";

function useVenueStorageKey(base: string): string {
  const { slug } = useVenueScope();
  return salesFiltersStorageKey(base, slug);
}

export function usePersistedSalesTableDateFilters() {
  const storageKey = useVenueStorageKey(SALES_TABLE_DATE_FILTERS_KEY);
  const [filters, setFilters] = useState<SalesTableDateFilters>(
    defaultSalesTableDateFilters,
  );
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = hydratedKey === storageKey;

  useEffect(() => {
    const stored = readSalesTableDateFilters(storageKey);
    setFilters(stored ?? defaultSalesTableDateFilters());
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeSalesTableDateFilters(storageKey, filters);
  }, [filters, hydrated, storageKey]);

  function setFromDate(value: string) {
    setFilters((prev) => ({
      fromDate: value,
      toDate: prev.toDate,
      weekFilter: "",
      monthFilter: "",
      yearFilter: "",
    }));
  }

  function setToDate(value: string) {
    setFilters((prev) => ({
      fromDate: prev.fromDate,
      toDate: value,
      weekFilter: "",
      monthFilter: "",
      yearFilter: "",
    }));
  }

  function setWeekFilter(value: string) {
    setFilters({
      fromDate: "",
      toDate: "",
      weekFilter: value,
      monthFilter: "",
      yearFilter: "",
    });
  }

  function setMonthFilter(value: string) {
    setFilters({
      fromDate: "",
      toDate: "",
      weekFilter: "",
      monthFilter: value,
      yearFilter: "",
    });
  }

  function applyThisWeek() {
    setFilters({
      fromDate: "",
      toDate: "",
      weekFilter: getCurrentWeekFilterKey(),
      monthFilter: "",
      yearFilter: "",
    });
  }

  function applyThisMonth() {
    setFilters({
      fromDate: "",
      toDate: "",
      weekFilter: "",
      monthFilter: getCurrentMonthKey(),
      yearFilter: "",
    });
  }

  function applyThisYear() {
    setFilters({
      fromDate: "",
      toDate: "",
      weekFilter: "",
      monthFilter: "",
      yearFilter: getCurrentYearKey(),
    });
  }

  function clearFilters() {
    setFilters({
      fromDate: "",
      toDate: "",
      weekFilter: "",
      monthFilter: "",
      yearFilter: "",
    });
  }

  return {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    weekFilter: filters.weekFilter,
    monthFilter: filters.monthFilter,
    yearFilter: filters.yearFilter,
    filters,
    setFromDate,
    setToDate,
    setWeekFilter,
    setMonthFilter,
    applyThisWeek,
    applyThisMonth,
    applyThisYear,
    clearFilters,
  };
}

/** Month picker backed by the shared sales table filter storage. */
export function usePersistedSalesMonthFilter() {
  const {
    filters,
    setMonthFilter,
    applyThisMonth,
  } = usePersistedSalesTableDateFilters();

  const monthFilter = resolveMonthFilterForDisplay(filters);

  return {
    monthFilter,
    setMonthFilter,
    applyThisMonth,
  };
}

export function usePersistedSalesInsightsFilters() {
  const storageKey = useVenueStorageKey(SALES_INSIGHTS_FILTERS_KEY);
  const [filters, setFilters] = useState<SalesInsightsFilters>(
    defaultSalesInsightsFilters,
  );
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = hydratedKey === storageKey;

  useEffect(() => {
    const stored = readSalesInsightsFilters(storageKey);
    setFilters(stored ?? defaultSalesInsightsFilters());
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeSalesInsightsFilters(storageKey, filters);
  }, [filters, hydrated, storageKey]);

  function selectPeriodMode(mode: SalesInsightsPeriodMode) {
    setFilters((prev) => {
      const next = { ...prev, periodMode: mode };
      if (mode === "week" && !next.weekFilter) {
        next.weekFilter = getCurrentWeekFilterKey();
      }
      if (mode === "month" && !next.monthFilter) {
        next.monthFilter = getCurrentMonthKey();
      }
      if (mode === "year" && !next.yearFilter) {
        next.yearFilter = getCurrentYearKey();
      }
      return next;
    });
  }

  function applyCurrentPeriod() {
    setFilters((prev) => {
      if (prev.periodMode === "week") {
        return { ...prev, weekFilter: getCurrentWeekFilterKey() };
      }
      if (prev.periodMode === "month") {
        return { ...prev, monthFilter: getCurrentMonthKey() };
      }
      return { ...prev, yearFilter: getCurrentYearKey() };
    });
  }

  function setActivePeriodValue(value: string) {
    setFilters((prev) => {
      if (prev.periodMode === "week") return { ...prev, weekFilter: value };
      if (prev.periodMode === "month") return { ...prev, monthFilter: value };
      return { ...prev, yearFilter: value };
    });
  }

  function setToDateOnly(value: boolean | ((prev: boolean) => boolean)) {
    setFilters((prev) => ({
      ...prev,
      toDateOnly:
        typeof value === "function" ? value(prev.toDateOnly) : value,
    }));
  }

  return {
    periodMode: filters.periodMode,
    weekFilter: filters.weekFilter,
    monthFilter: filters.monthFilter,
    yearFilter: filters.yearFilter,
    toDateOnly: filters.toDateOnly,
    selectPeriodMode,
    applyCurrentPeriod,
    setActivePeriodValue,
    setToDateOnly,
    setWeekFilter: (value: string) =>
      setFilters((prev) => ({ ...prev, weekFilter: value })),
    setMonthFilter: (value: string) =>
      setFilters((prev) => ({ ...prev, monthFilter: value })),
    setYearFilter: (value: string) =>
      setFilters((prev) => ({ ...prev, yearFilter: value })),
  };
}

export function usePersistedSalesEntryDate(fallback = defaultSalesEntryDate()) {
  const storageKey = useVenueStorageKey(SALES_ENTRY_DATE_KEY);
  const [selectedDate, setSelectedDateState] = useState(fallback);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = hydratedKey === storageKey;

  useEffect(() => {
    const stored = readSalesEntryDate(storageKey);
    if (stored) setSelectedDateState(stored);
    else setSelectedDateState(fallback);
    setHydratedKey(storageKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rehydrate on venue/key change
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeSalesEntryDate(storageKey, selectedDate);
  }, [hydrated, selectedDate, storageKey]);

  function setSelectedDate(value: string) {
    setSelectedDateState(value);
  }

  return { selectedDate, setSelectedDate };
}

export function usePersistedSalesWaiterSelection() {
  const storageKey = useVenueStorageKey(SALES_WAITER_SELECTION_KEY);
  const [selectedWaiterId, setSelectedWaiterIdState] = useState("");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = hydratedKey === storageKey;

  useEffect(() => {
    const stored = readSalesWaiterSelection(storageKey);
    setSelectedWaiterIdState(stored ?? "");
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeSalesWaiterSelection(storageKey, selectedWaiterId);
  }, [hydrated, selectedWaiterId, storageKey]);

  return {
    selectedWaiterId,
    setSelectedWaiterId: setSelectedWaiterIdState,
  };
}

export function usePersistedFiguresAlertsFilters() {
  const storageKey = useVenueStorageKey(SALES_FIGURES_ALERTS_FILTERS_KEY);
  const [filters, setFilters] = useState<FiguresAlertsFilters>(
    defaultFiguresAlertsFilters,
  );
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const hydrated = hydratedKey === storageKey;

  useEffect(() => {
    const stored = readFiguresAlertsFilters(storageKey);
    setFilters(stored ?? defaultFiguresAlertsFilters());
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeFiguresAlertsFilters(storageKey, filters);
  }, [filters, hydrated, storageKey]);

  function selectPeriodMode(mode: FiguresAlertsPeriodMode) {
    setFilters((prev) => ({ ...prev, periodMode: mode }));
  }

  return {
    periodMode: filters.periodMode,
    selectedDate: filters.selectedDate,
    weekFilter: filters.weekFilter,
    monthFilter: filters.monthFilter,
    selectPeriodMode,
    setSelectedDate: (value: string | ((prev: string) => string)) =>
      setFilters((prev) => ({
        ...prev,
        selectedDate:
          typeof value === "function" ? value(prev.selectedDate) : value,
      })),
    setWeekFilter: (value: string | ((prev: string) => string)) =>
      setFilters((prev) => ({
        ...prev,
        weekFilter:
          typeof value === "function" ? value(prev.weekFilter) : value,
      })),
    setMonthFilter: (value: string | ((prev: string) => string)) =>
      setFilters((prev) => ({
        ...prev,
        monthFilter:
          typeof value === "function" ? value(prev.monthFilter) : value,
      })),
    setPeriodMode: selectPeriodMode,
  };
}
