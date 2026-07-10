"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { Venue } from "@/lib/types/database";

type VenueContextValue = {
  venue: Venue | null;
  setVenue: (venue: Venue | null) => void;
};

const VenueContext = createContext<VenueContextValue | undefined>(undefined);

type VenueProviderProps = {
  children: ReactNode;
  initialVenue?: Venue | null;
};

export function VenueProvider({ children, initialVenue = null }: VenueProviderProps) {
  const setVenue = useCallback((_venue: Venue | null) => {
    // Client-side updates are driven by navigation + cookie refresh.
  }, []);

  const value = useMemo(
    () => ({ venue: initialVenue, setVenue }),
    [initialVenue, setVenue],
  );

  return (
    <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
  );
}

export function useVenue() {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error("useVenue must be used within VenueProvider");
  }
  return context;
}

export function venueThemeStyle(venue: Venue | null): React.CSSProperties {
  if (!venue) return {};
  return {
    ["--venue-primary" as string]: venue.primary_color,
    ["--venue-secondary" as string]: venue.secondary_color,
  };
}
