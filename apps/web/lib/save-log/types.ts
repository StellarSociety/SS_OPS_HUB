export const SAVE_LOG_MODULE_KEY = "save_log" as const;

export const SAVE_LOG_FEATURES = {
  overview: "overview",
  logs: "logs",
  settings: "settings",
} as const;

export const SAVE_LOG_BUCKET = "save-log-records";

export const SAVE_LOG_MAX_FILE_BYTES = 15 * 1024 * 1024;

export const DEFAULT_SAVE_LOG_TYPES: {
  key: string;
  label: string;
  description: string;
  sort_order: number;
  required_daily: boolean;
}[] = [
  {
    key: "fridge_temps",
    label: "Fridge temperatures",
    description: "Daily fridge temperature checks.",
    sort_order: 10,
    required_daily: true,
  },
  {
    key: "freezer_temps",
    label: "Freezer temperatures",
    description: "Daily freezer temperature checks.",
    sort_order: 20,
    required_daily: true,
  },
  {
    key: "hot_holding",
    label: "Hot holding",
    description: "Hot-holding temperature records.",
    sort_order: 30,
    required_daily: true,
  },
  {
    key: "cooking_cooling",
    label: "Cooking & cooling",
    description: "Cooking and cooling temperature logs.",
    sort_order: 40,
    required_daily: true,
  },
  {
    key: "receiving",
    label: "Receiving",
    description: "Goods-in and delivery checks.",
    sort_order: 50,
    required_daily: true,
  },
  {
    key: "cleaning",
    label: "Cleaning & sanitation",
    description: "Daily cleaning and sanitation records.",
    sort_order: 60,
    required_daily: true,
  },
  {
    key: "staff_hygiene",
    label: "Staff hygiene",
    description: "Staff illness and hygiene checks.",
    sort_order: 70,
    required_daily: true,
  },
  {
    key: "probe_calibration",
    label: "Probe calibration",
    description: "Thermometer and probe calibration records.",
    sort_order: 80,
    required_daily: false,
  },
];

export type SaveLogType = {
  id: string;
  venue_id: string;
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  required_daily: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveLogRecord = {
  id: string;
  venue_id: string;
  type_id: string;
  log_date: string;
  original_name: string;
  storage_path: string;
  file_url: string;
  content_type: string;
  file_size: number | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export function todayIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
