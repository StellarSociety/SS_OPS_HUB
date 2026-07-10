export type Venue = {
  id: string;
  slug: string;
  name: string;
  is_global: boolean;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "disabled";
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      venues: {
        Row: Venue;
        Insert: Omit<Venue, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Venue>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at"> & { created_at?: string };
        Update: Partial<Profile>;
      };
      user_permissions: {
        Row: {
          id: string;
          user_id: string;
          venue_id: string | null;
          module_key: string;
          feature_key: string;
          access_level: "admin" | "edit" | "view" | "submit";
          created_at: string;
        };
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          module_key: string | null;
          entity: string | null;
          entity_id: string | null;
          venue_id: string | null;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
          created_at: string;
        };
      };
    };
  };
};
