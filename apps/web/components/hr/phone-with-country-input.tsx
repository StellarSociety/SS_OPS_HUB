"use client";

import { useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  joinPhone,
  PHONE_COUNTRY_CODES,
  splitPhone,
  whatsappChatUrl,
} from "@/lib/hr/phone";
import { cn } from "@/lib/utils";

/** Matches country-code control width so phone/WhatsApp rows share one grid. */
export const PHONE_COUNTRY_CONTROL_CLASS = "w-[5.75rem] shrink-0";
export const CONTACT_ACTION_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors";

type PhoneWithCountryInputProps = {
  id: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  /** Show WhatsApp logo (right) that opens a chat to this number. */
  whatsappLink?: boolean;
  /** Keep a trailing action-sized slot so rows align with linked fields. */
  reserveTrailing?: boolean;
};

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-1.99.522.522-1.93-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function PhoneWithCountryInput({
  id,
  name,
  value,
  onChange,
  disabled,
  placeholder,
  className,
  selectClassName,
  inputClassName,
  whatsappLink = false,
  reserveTrailing = false,
}: PhoneWithCountryInputProps) {
  const { countryCode, national } = splitPhone(value);
  const code =
    PHONE_COUNTRY_CODES.some((c) => c.code === countryCode)
      ? countryCode
      : DEFAULT_PHONE_COUNTRY_CODE;

  const options = useMemo(
    () =>
      PHONE_COUNTRY_CODES.map((c) => ({
        value: c.code,
        label: c.code,
        searchText: `${c.label} ${c.name}`,
      })),
    [],
  );

  const chatUrl = whatsappLink ? whatsappChatUrl(value) : null;

  function setCode(nextCode: string) {
    onChange(joinPhone(nextCode || DEFAULT_PHONE_COUNTRY_CODE, national));
  }

  function setNational(nextNational: string) {
    onChange(joinPhone(code, nextNational));
  }

  const trailing =
    whatsappLink ? (
      chatUrl ? (
        <a
          href={chatUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in WhatsApp"
          aria-label="Open in WhatsApp"
          className={cn(
            CONTACT_ACTION_CLASS,
            "border-[#25D366]/35 bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20",
          )}
        >
          <WhatsAppGlyph className="h-5 w-5" />
        </a>
      ) : (
        <span
          title="Enter a WhatsApp number first"
          aria-hidden
          className={cn(
            CONTACT_ACTION_CLASS,
            "border-black/10 bg-black/[0.03] text-black/25",
          )}
        >
          <WhatsAppGlyph className="h-5 w-5" />
        </span>
      )
    ) : reserveTrailing ? (
      <span className="h-10 w-10 shrink-0" aria-hidden />
    ) : null;

  return (
    <div className={cn("flex gap-2", className)}>
      <input type="hidden" name={name} value={value} />
      <SearchableSelect
        id={`${id}_country`}
        aria-label="Country code"
        value={code}
        onChange={setCode}
        options={options}
        placeholder="Code"
        searchPlaceholder="Search country or code…"
        disabled={disabled}
        clearable={false}
        className={cn(selectClassName, PHONE_COUNTRY_CONTROL_CLASS)}
      />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={national}
        onChange={(e) => setNational(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(inputClassName, "min-w-0 flex-1")}
      />
      {trailing}
    </div>
  );
}
