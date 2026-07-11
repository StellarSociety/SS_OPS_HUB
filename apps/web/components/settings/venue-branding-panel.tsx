"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ImageIcon, RotateCcw, Trash2, Upload } from "lucide-react";
import {
  removeVenueBrandAsset,
  updateVenueBranding,
  uploadVenueBrandAsset,
} from "@/lib/actions/venue-branding";
import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type { Venue } from "@/lib/types/database";
import {
  BRAND_ASSET_ACCEPT,
  BRAND_ASSET_LABELS,
  type BrandAssetType,
  normalizeHexColor,
} from "@/lib/venue/branding-validation";
import {
  getDefaultBrandAssetUrl,
  getVenueBadgeUrl,
  getVenueIconUrl,
  getVenueLogoUrl,
  hasClearableBrandAsset,
  venueUsesCustomBrandAsset,
} from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";
import { cn } from "@/lib/utils";

const settingsInputClass =
  "mt-1 border-black/10 bg-white text-[#3D421F] placeholder:text-black/40 focus-visible:ring-[var(--venue-primary)] focus-visible:ring-offset-0";

const lightOutlineButtonClass =
  "border-black/15 bg-white text-[#3D421F] hover:bg-black/5 hover:text-[#3D421F]";

type VenueBrandingPanelProps = {
  venue: Venue;
};

function assetPreviewUrl(venue: Venue, assetType: BrandAssetType): string | null {
  switch (assetType) {
    case "logo":
      return getVenueLogoUrl(venue);
    case "icon":
      return getVenueIconUrl(venue);
    case "favicon":
      return getVenueBadgeUrl(venue);
  }
}

export function VenueBrandingPanel({ venue: initialVenue }: VenueBrandingPanelProps) {
  const [venue, setVenue] = useState(initialVenue);
  const [name, setName] = useState(initialVenue.name);
  const [primaryColor, setPrimaryColor] = useState(initialVenue.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(initialVenue.secondary_color);
  const [uploadingAsset, setUploadingAsset] = useState<BrandAssetType | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputs = useRef<Record<BrandAssetType, HTMLInputElement | null>>({
    logo: null,
    icon: null,
    favicon: null,
  });

  useEffect(() => {
    setVenue(initialVenue);
    setName(initialVenue.name);
    setPrimaryColor(initialVenue.primary_color);
    setSecondaryColor(initialVenue.secondary_color);
  }, [initialVenue]);

  const previewVenue = {
    ...venue,
    name: name.trim() || venue.name,
    primary_color: normalizeHexColor(primaryColor) ?? venue.primary_color,
    secondary_color: normalizeHexColor(secondaryColor) ?? venue.secondary_color,
  };

  const hasUnsavedChanges =
    name.trim() !== venue.name ||
    (normalizeHexColor(primaryColor) ?? primaryColor) !== venue.primary_color ||
    (normalizeHexColor(secondaryColor) ?? secondaryColor) !== venue.secondary_color;

  function handleSaveBranding() {
    startTransition(async () => {
      const result = await updateVenueBranding({
        venueId: venue.id,
        name,
        primaryColor,
        secondaryColor,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.venue) setVenue(result.venue as Venue);
      toast.saved(result.success ?? "Venue branding saved.");
    });
  }

  function handleUpload(assetType: BrandAssetType, file: File) {
    setUploadingAsset(assetType);

    const formData = new FormData();
    formData.set("venue_id", venue.id);
    formData.set("asset_type", assetType);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadVenueBrandAsset(formData);
      setUploadingAsset(null);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.venue) setVenue(result.venue as Venue);
      toast.uploaded(result.success ?? "Asset uploaded.");
    });
  }

  function handleRemove(assetType: BrandAssetType) {
    startTransition(async () => {
      const result = await removeVenueBrandAsset({
        venueId: venue.id,
        assetType,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.venue) setVenue(result.venue as Venue);
      toast.saved(result.success ?? "Asset cleared. Built-in default restored.");
    });
  }

  function handleResetDraft() {
    setName(venue.name);
    setPrimaryColor(venue.primary_color);
    setSecondaryColor(venue.secondary_color);
  }

  return (
    <div className="space-y-4">
      {hasUnsavedChanges ? (
        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
          Unsaved name or color changes
        </p>
      ) : null}

      <Card className="p-5">
        <h2 className="font-serif text-lg text-[#3D421F]">Venue identity</h2>
        <p className="mt-1 text-sm text-black/50">
          How this venue is labeled in the app — separate from login accounts or staff
          records.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="venue-branding-name">Display name</Label>
            <Input
              id="venue-branding-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={settingsInputClass}
              placeholder="e.g. Orilla Restaurant"
              disabled={isPending}
            />
            <FieldHint>
              Shown in the sidebar, venue picker, module headers, and PDF exports.
              Save below to apply.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="venue-branding-slug">Venue slug (read-only)</Label>
            <Input
              id="venue-branding-slug"
              value={previewVenue.slug}
              readOnly
              className={cn(
                settingsInputClass,
                "cursor-not-allowed bg-black/[0.03] font-mono text-sm text-black/60",
              )}
            />
            <FieldHint>
              Internal URL key used when you select this venue (cookie + routing).
              Changing it would break active sessions and bookmarks, so it is fixed at
              venue setup.
            </FieldHint>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-serif text-lg text-[#3D421F]">Brand colors</h2>
        <p className="mt-1 text-sm text-black/50">
          Hex colors that theme the app shell for this venue.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ColorField
            id="venue-primary-color"
            label="Primary color"
            hint="Buttons, active tabs, accents, and sidebar highlights."
            value={primaryColor}
            onChange={setPrimaryColor}
            disabled={isPending}
            inputClassName={settingsInputClass}
          />
          <ColorField
            id="venue-secondary-color"
            label="Secondary color"
            hint="Page backgrounds, chips, and soft highlight surfaces."
            value={secondaryColor}
            onChange={setSecondaryColor}
            disabled={isPending}
            inputClassName={settingsInputClass}
          />
        </div>

        <div
          className="mt-4 rounded-xl border border-black/10 p-4"
          style={venueThemeStyle(previewVenue)}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Color preview
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-[var(--venue-primary)] px-4 py-2 text-sm font-medium text-white">
              Primary button
            </span>
            <span className="rounded-lg border border-black/10 bg-[var(--venue-secondary)] px-4 py-2 text-sm text-[#3D421F]">
              Secondary surface
            </span>
            <span className="rounded-lg border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 px-4 py-2 text-sm text-[#3D421F]">
              Accent chip
            </span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-serif text-lg text-[#3D421F]">Brand assets</h2>
        <p className="mt-1 text-sm text-black/50">
          Logo, icon, and favicon for this venue. Drag and drop onto each card, click
          the preview area, or use Upload new. PNG files are stored as-is (transparency
          preserved). Clear removes your upload and restores the built-in default when
          one exists.
        </p>
        <div
          className="mt-4 grid gap-4 lg:grid-cols-3"
          style={venueThemeStyle(previewVenue)}
        >
          {(["logo", "icon", "favicon"] as const).map((assetType) => (
            <AssetUploadCard
              key={assetType}
              assetType={assetType}
              venue={previewVenue}
              disabled={isPending}
              uploading={uploadingAsset === assetType}
              fileInputRef={(node) => {
                fileInputs.current[assetType] = node;
              }}
              onChooseFile={() => fileInputs.current[assetType]?.click()}
              onFileSelected={(file) => handleUpload(assetType, file)}
              onRemove={() => handleRemove(assetType)}
            />
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-serif text-lg text-[#3D421F]">Live preview</h2>
        <p className="mt-1 text-sm text-black/50">
          How branding appears in the sidebar, browser tab, and venue picker.
        </p>
        <div
          className="mt-4 grid gap-6 lg:grid-cols-[minmax(220px,280px)_1fr]"
          style={venueThemeStyle(previewVenue)}
        >
          <SidebarPreview venue={previewVenue} />
          <div className="grid gap-4 sm:grid-cols-3">
            <AssetPreviewTile label="Logo" venue={previewVenue} variant="wordmark" />
            <AssetPreviewTile label="Icon" venue={previewVenue} variant="mark" />
            <AssetPreviewTile label="Favicon" venue={previewVenue} variant="badge" />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
        <p className="text-xs text-black/50">
          Uploads save immediately. Name and colors require Save.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className={lightOutlineButtonClass}
            disabled={isPending || !hasUnsavedChanges}
            onClick={handleResetDraft}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button type="button" disabled={isPending} onClick={handleSaveBranding}>
            {isPending ? "Saving…" : "Save name & colors"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-black/50">{children}</p>;
}

function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  inputClassName,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputClassName?: string;
}) {
  const pickerValue = normalizeHexColor(value) ?? "#818A40";

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <FieldHint>{hint}</FieldHint>
      <div className="mt-2 flex items-center gap-3">
        <input
          id={`${id}-picker`}
          type="color"
          value={pickerValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-md border border-black/10 bg-white p-1"
          aria-label={`${label} picker`}
        />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="#818A40"
          className={cn("font-mono uppercase", inputClassName)}
        />
      </div>
    </div>
  );
}

function AssetPreviewTile({
  label,
  venue,
  variant,
}: {
  label: string;
  venue: Venue;
  variant: "wordmark" | "mark" | "badge";
}) {
  const isWordmark = variant === "wordmark";

  return (
    <div className="flex min-h-[160px] flex-col rounded-xl border border-black/10 bg-white/80 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </p>
      <div
        className={cn(
          "mt-3 flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 bg-[var(--venue-secondary)]/30 p-4",
          isWordmark ? "min-h-[100px]" : "min-h-[120px]",
        )}
      >
        <VenueBrandIcon
          slug={venue.slug}
          name={venue.name}
          primaryColor={venue.primary_color}
          logoUrl={venue.logo_url}
          iconUrl={venue.icon_url}
          faviconUrl={venue.favicon_url}
          variant={variant}
          className={cn(
            isWordmark ? "h-10 w-auto max-w-full" : "h-16 w-16",
            variant === "badge" && "rounded-full",
          )}
        />
      </div>
    </div>
  );
}

function SidebarPreview({ venue }: { venue: Venue }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70 shadow-sm">
      <div className="flex h-14 items-center justify-center border-b border-black/10 bg-white/60 px-4">
        <VenueBrandIcon
          slug={venue.slug}
          name={venue.name}
          primaryColor={venue.primary_color}
          logoUrl={venue.logo_url}
          iconUrl={venue.icon_url}
          faviconUrl={venue.favicon_url}
          variant="wordmark"
          className="h-7 w-auto max-w-full"
        />
      </div>
      <div className="space-y-1.5 p-3">
        <div className="h-9 rounded-lg bg-[var(--venue-primary)]/15 px-3 py-2 text-xs font-medium text-[#3D421F]">
          Active module
        </div>
        <div className="h-9 rounded-lg px-3 py-2 text-xs text-black/55">Dashboard</div>
        <div className="h-9 rounded-lg px-3 py-2 text-xs text-black/55">
          Sales & Revenue
        </div>
        <div className="h-9 rounded-lg bg-[var(--venue-secondary)]/50 px-3 py-2 text-xs text-black/55">
          Settings
        </div>
      </div>
    </div>
  );
}

function AssetUploadCard({
  assetType,
  venue,
  disabled,
  uploading,
  fileInputRef,
  onChooseFile,
  onFileSelected,
  onRemove,
}: {
  assetType: BrandAssetType;
  venue: Venue;
  disabled?: boolean;
  uploading?: boolean;
  fileInputRef: (node: HTMLInputElement | null) => void;
  onChooseFile: () => void;
  onFileSelected: (file: File) => void;
  onRemove: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const previewUrl = assetPreviewUrl(venue, assetType);
  const isCustom = venueUsesCustomBrandAsset(venue, assetType);
  const canClear = hasClearableBrandAsset(venue, assetType);
  const hasDefault = Boolean(getDefaultBrandAssetUrl(venue.slug, assetType));

  return (
    <div className="rounded-xl border border-black/10 bg-white/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-[#3D421F]">{BRAND_ASSET_LABELS[assetType]}</p>
          <p className="mt-1 text-xs text-black/50">
            {assetType === "logo"
              ? "Full wordmark for headers and exports."
              : assetType === "icon"
                ? "Square mark used in compact spaces."
                : "Circle badge for favicon and collapsed sidebar."}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            isCustom
              ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
              : canClear
                ? "bg-amber-50 text-amber-800"
                : "bg-black/5 text-black/45",
          )}
        >
          {isCustom ? "Uploaded" : canClear ? "Override" : hasDefault ? "Default" : "Fallback"}
        </span>
      </div>

      <button
        type="button"
        disabled={disabled || uploading}
        className={cn(
          "mt-4 flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed transition-colors",
          isDragging
            ? "border-[var(--venue-primary)] bg-[var(--venue-primary)]/10"
            : "border-black/10 bg-[var(--venue-secondary)]/25 hover:border-[var(--venue-primary)]/35 hover:bg-[var(--venue-secondary)]/40",
          (disabled || uploading) && "cursor-not-allowed opacity-60",
        )}
        onClick={() => {
          if (!disabled && !uploading) onChooseFile();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (disabled || uploading) return;
          const file = event.dataTransfer.files?.[0];
          if (file) onFileSelected(file);
        }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`${venue.name} ${assetType}`}
            className="max-h-24 max-w-full object-contain px-3"
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-black/20" />
        )}
        <p className="mt-2 text-xs font-medium text-black/50">
          {isDragging ? "Drop to upload new" : "Drag & drop or click to upload new"}
        </p>
        <p className="mt-0.5 text-[10px] text-black/40">PNG · JPG · WebP · SVG · ICO</p>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={BRAND_ASSET_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
          event.target.value = "";
        }}
      />

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(lightOutlineButtonClass, "min-w-0 flex-1")}
          disabled={disabled || uploading}
          onClick={onChooseFile}
        >
          <Upload className="h-4 w-4 shrink-0" />
          {uploading ? "Uploading…" : "Upload new"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(lightOutlineButtonClass, "min-w-0 flex-1")}
          disabled={disabled || uploading || !canClear}
          onClick={onRemove}
          title={
            canClear
              ? "Remove uploaded asset and restore built-in default"
              : "No custom asset stored — upload new to replace the built-in default"
          }
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          Clear
        </Button>
      </div>
      {!canClear && hasDefault ? (
        <p className="mt-2 text-[10px] text-black/45">
          Using built-in default. Upload new to replace, or Clear becomes available after
          you upload.
        </p>
      ) : null}
    </div>
  );
}
