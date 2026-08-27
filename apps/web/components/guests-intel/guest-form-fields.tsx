"use client";

import { useState } from "react";
import { GuestChoiceSet } from "@/components/guests-intel/guest-choice-set";
import { MonthDayInput } from "@/components/guests-intel/month-day-input";
import { PhoneWithCountryInput } from "@/components/hr/phone-with-country-input";
import { Input, inputVariants } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  GUEST_ALLERGENS,
  GUEST_OTHER_DIETS,
} from "@/lib/guests-intel/types";
import { cn } from "@/lib/utils";

type GuestFormFieldsProps = {
  defaultRewardId?: string | null;
  disabled?: boolean;
  idPrefix?: string;
};

export function GuestFormFields({
  defaultRewardId,
  disabled,
  idPrefix = "guest",
}: GuestFormFieldsProps) {
  const [phone, setPhone] = useState("");

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="First name" htmlFor={`${idPrefix}-first`}>
        <Input
          id={`${idPrefix}-first`}
          name="first_name"
          required
          autoComplete="given-name"
          disabled={disabled}
        />
      </Field>
      <Field label="Last name" htmlFor={`${idPrefix}-last`}>
        <Input
          id={`${idPrefix}-last`}
          name="last_name"
          autoComplete="family-name"
          disabled={disabled}
        />
      </Field>
      <Field
        label="Birth / anniversary date"
        htmlFor={`${idPrefix}-anniversary-day`}
        hint="Day and month only"
        className="col-span-2"
      >
        <MonthDayInput
          id={`${idPrefix}-anniversary`}
          name="birth_anniversary"
          disabled={disabled}
        />
      </Field>
      <Field
        label="Email"
        htmlFor={`${idPrefix}-email`}
        className="col-span-2"
      >
        <Input
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={disabled}
        />
      </Field>
      <Field
        label="Phone"
        htmlFor={`${idPrefix}-phone`}
        className="col-span-2"
      >
        <PhoneWithCountryInput
          id={`${idPrefix}-phone`}
          name="phone"
          value={phone}
          onChange={setPhone}
          disabled={disabled}
          autoDetectCountry
          placeholder="50 123 4567"
          inputClassName={cn(inputVariants())}
        />
      </Field>
      <input type="hidden" name="reward_id" value={defaultRewardId ?? ""} />
      <div className="col-span-2 space-y-4 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 p-4">
        <div>
          <p className="text-sm font-semibold text-[#3D421F]">
            Dietary restrictions
          </p>
          <p className="text-xs text-black/50">
            Select all that apply. You can also add anything that is not listed.
          </p>
        </div>
        <Field
          label="Allergens"
          htmlFor={`${idPrefix}-allergen-add`}
          align="center"
        >
          <GuestChoiceSet
            name="allergens"
            options={GUEST_ALLERGENS}
            disabled={disabled}
            addPlaceholder="Add other allergen…"
            addInputId={`${idPrefix}-allergen-add`}
          />
        </Field>
        <Field
          label="Other diets"
          htmlFor={`${idPrefix}-diet-add`}
          align="center"
        >
          <GuestChoiceSet
            name="other_diets"
            options={GUEST_OTHER_DIETS}
            disabled={disabled}
            addPlaceholder="Add other diet…"
            addInputId={`${idPrefix}-diet-add`}
          />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label="Notes" htmlFor={`${idPrefix}-notes`}>
          <Textarea
            id={`${idPrefix}-notes`}
            name="notes"
            rows={3}
            disabled={disabled}
          />
        </Field>
      </div>
      <label className="col-span-2 flex items-center gap-2 text-sm text-[#3D421F]">
        <input
          type="checkbox"
          name="marketing_opt_in"
          className="h-4 w-4 rounded border-black/20"
          disabled={disabled}
        />
        Happy to hear about future offers
      </label>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  align = "start",
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  align?: "start" | "center";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", align === "center" && "text-center", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint ? <p className="text-xs text-black/45">{hint}</p> : null}
      {children}
    </div>
  );
}
