"use client";

import { Eye, Mail, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveEmailChromeSettings,
  sendTestEmailChrome,
} from "@/lib/actions/hr-email-chrome";
import {
  EMAIL_CHROME_FOOTER_HEIGHT_CM,
  EMAIL_CHROME_HEADER_HEIGHT_CM,
  EMAIL_CHROME_SOCIAL_ICON_PX,
  EMAIL_CHROME_SOCIAL_LINK_KEYS,
  EMAIL_CHROME_SOCIAL_LINKS,
  emailChromeSocialFormName,
  type EmailChromeSocialLinkKey,
  type HrEmailChromeSettings,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save header & footer"}
    </Button>
  );
}

function normalizePreviewUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(raw) || raw.includes("/")) {
    return `https://${raw.replace(/^\/+/, "")}`;
  }
  return raw;
}

function SocialIconImage({
  icon,
  className,
  sizePx = EMAIL_CHROME_SOCIAL_ICON_PX,
}: {
  icon: (typeof EMAIL_CHROME_SOCIAL_LINKS)[number]["icon"];
  className?: string;
  /** Fixed display size — never scales with layout width. */
  sizePx?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/email/social/${icon}.svg`}
      alt=""
      aria-hidden
      width={sizePx}
      height={sizePx}
      className={cn("shrink-0", className)}
      style={{ width: sizePx, height: sizePx, maxWidth: sizePx }}
    />
  );
}

function ChromePreviewFrame({
  venueName,
  venueLogoUrl,
  headerBackgroundColor,
  footerText,
  previewSocials,
  className,
}: {
  venueName: string;
  venueLogoUrl?: string | null;
  headerBackgroundColor: string;
  footerText: string;
  previewSocials: Array<{
    key: string;
    label: string;
    icon: (typeof EMAIL_CHROME_SOCIAL_LINKS)[number]["icon"];
    href: string;
  }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Cap to email-column width so icons don't look oversized on wide screens.
        "mx-auto w-full max-w-[640px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm",
        className,
      )}
    >
      <div
        className="flex items-center justify-center overflow-hidden px-4"
        style={{
          height: `${EMAIL_CHROME_HEADER_HEIGHT_CM}cm`,
          maxHeight: `${EMAIL_CHROME_HEADER_HEIGHT_CM}cm`,
          backgroundColor: headerBackgroundColor,
        }}
      >
        {venueLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venueLogoUrl}
            alt={venueName}
            width={100}
            height={40}
            decoding="async"
            fetchPriority="high"
            className="h-auto max-h-[2.2cm] w-[100px] object-contain"
          />
        ) : (
          <span className="text-sm font-semibold text-[#3D421F]">
            {venueName}
          </span>
        )}
      </div>
      <div className="border-y border-black/5 px-4 py-5 text-sm text-[#3D421F]/70">
        Message body appears here.
      </div>
      <div
        className="border-t border-[#d9dcc8] px-3 py-2.5 text-center text-[10px] leading-snug text-[#6b7250]"
        style={{
          minHeight: `${EMAIL_CHROME_FOOTER_HEIGHT_CM}cm`,
        }}
      >
        <p className="whitespace-pre-wrap text-center">
          {footerText.trim() || "Footer text…"}
        </p>
        {previewSocials.length > 0 ? (
          <div className="mt-2 flex items-center justify-center gap-2.5">
            {previewSocials.map((row) => (
              <a
                key={row.key}
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex opacity-80 transition hover:opacity-100"
                title={row.label}
                aria-label={row.label}
              >
                <SocialIconImage icon={row.icon} />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmailChromeSettingsPanel({
  settings,
  venueName,
  venueLogoUrl,
  defaultTestTo = "",
}: {
  settings: HrEmailChromeSettings;
  venueName: string;
  venueLogoUrl?: string | null;
  defaultTestTo?: string;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [headerBackgroundColor, setHeaderBackgroundColor] = useState(
    settings.headerBackgroundColor,
  );
  const [footerText, setFooterText] = useState(settings.footerText);
  const [socials, setSocials] = useState<
    Record<EmailChromeSocialLinkKey, string>
  >(() =>
    Object.fromEntries(
      EMAIL_CHROME_SOCIAL_LINK_KEYS.map((key) => [key, settings[key] ?? ""]),
    ) as Record<EmailChromeSocialLinkKey, string>,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState(defaultTestTo);
  const [testPending, startTestTransition] = useTransition();

  const previewSocials = useMemo(
    () =>
      EMAIL_CHROME_SOCIAL_LINKS.flatMap((row) => {
        const href = normalizePreviewUrl(socials[row.key] ?? "");
        if (!href) return [];
        return [{ ...row, href }];
      }),
    [socials],
  );

  const watch = useMemo(
    () =>
      JSON.stringify({
        enabled,
        headerBackgroundColor,
        footerText,
        ...socials,
      }),
    [enabled, headerBackgroundColor, footerText, socials],
  );

  function appendChromeFields(formData: FormData) {
    formData.set("enabled", enabled ? "true" : "false");
    formData.set("header_background_color", headerBackgroundColor);
    formData.set("footer_text", footerText);
    for (const key of EMAIL_CHROME_SOCIAL_LINK_KEYS) {
      formData.set(emailChromeSocialFormName(key), socials[key] ?? "");
    }
  }

  async function handleSave(formData: FormData) {
    setStatusMessage(null);
    setStatusError(null);
    appendChromeFields(formData);
    const result = await saveEmailChromeSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Email header and footer saved.");
    return result;
  }

  function handleSendTest() {
    startTestTransition(async () => {
      setStatusMessage(null);
      setStatusError(null);
      const fd = new FormData();
      appendChromeFields(fd);
      fd.set("test_to", testTo);
      const result = await sendTestEmailChrome(fd);
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      setStatusMessage(result.message);
      setTestOpen(false);
    });
  }

  const previewProps = {
    venueName,
    venueLogoUrl,
    headerBackgroundColor,
    footerText,
    previewSocials,
  };

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">
          Header &amp; footer
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Applied to HR template emails. Header height is fixed at{" "}
          {EMAIL_CHROME_HEADER_HEIGHT_CM} cm and footer at least{" "}
          {EMAIL_CHROME_FOOTER_HEIGHT_CM} cm. Social icons appear under the
          footer text with links.
        </p>
      </div>

      <GuardedSettingsForm
        action={handleSave}
        className="space-y-6"
        watch={watch}
      >
        <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-black/20"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block font-medium">
              Include header and footer on emails
            </span>
            <span className="mt-0.5 block text-xs text-black/55">
              When off, only the message body is sent.
            </span>
          </span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="email_chrome_header_bg">Header background</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="email_chrome_header_bg"
              type="color"
              value={headerBackgroundColor}
              onChange={(e) => setHeaderBackgroundColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-md border border-black/10 bg-white p-1"
            />
            <Input
              value={headerBackgroundColor}
              onChange={(e) => setHeaderBackgroundColor(e.target.value)}
              className="h-9 max-w-[9rem] font-mono text-sm"
              spellCheck={false}
            />
            <span className="text-xs text-black/50">
              Light green recommended for the logo band.
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email_chrome_footer">Footer text</Label>
          <textarea
            id="email_chrome_footer"
            rows={5}
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder={
              "Disclaimer…\n\nCompany address, street, city, country"
            }
            className="w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
          />
          <p className="text-[11px] text-black/50">
            Centered in the email. Use line breaks to separate disclaimer and
            address.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-[#3D421F]">
              Website &amp; social links
            </p>
            <p className="mt-0.5 text-xs text-black/50">
              Leave blank to hide an icon. Icons appear under the footer text
              with hyperlinks.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {EMAIL_CHROME_SOCIAL_LINKS.map((row) => (
              <div key={row.key} className="space-y-1.5">
                <Label
                  htmlFor={`email_chrome_${row.key}`}
                  className="inline-flex items-center gap-1.5"
                >
                  <SocialIconImage icon={row.icon} />
                  {row.label}
                </Label>
                <Input
                  id={`email_chrome_${row.key}`}
                  type="url"
                  value={socials[row.key] ?? ""}
                  onChange={(e) =>
                    setSocials((current) => ({
                      ...current,
                      [row.key]: e.target.value,
                    }))
                  }
                  placeholder={row.placeholder}
                  className="h-9"
                />
              </div>
            ))}
          </div>
        </div>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Preview
          </p>
          <ChromePreviewFrame {...previewProps} />
        </section>

        {statusMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {statusMessage}
          </p>
        ) : null}
        {statusError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {statusError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 w-9 px-0"
              aria-label="Preview header and footer"
              title="Preview"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="size-4" strokeWidth={2} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setStatusMessage(null);
                setStatusError(null);
                setTestOpen(true);
              }}
            >
              <Mail className="size-3.5" strokeWidth={2} />
              Send test email
            </Button>
          </div>
          <SaveButton />
        </div>
      </GuardedSettingsForm>

      {previewOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close preview"
            onClick={() => setPreviewOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-chrome-preview-title"
            className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
              <div>
                <h2
                  id="email-chrome-preview-title"
                  className="font-serif text-lg text-[#3D421F]"
                >
                  Email preview
                </h2>
                <p className="mt-0.5 text-sm text-black/50">
                  Live look from the form values above
                  {enabled ? "" : " (header/footer currently off when sending)"}.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 shrink-0 px-0"
                aria-label="Close"
                onClick={() => setPreviewOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--venue-secondary,#F0F3DD)]/25 p-5">
              <ChromePreviewFrame {...previewProps} />
            </div>
          </div>
        </div>
      ) : null}

      {testOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close send test"
            onClick={() => {
              if (!testPending) setTestOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-chrome-test-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
              <div>
                <h2
                  id="email-chrome-test-title"
                  className="font-serif text-lg text-[#3D421F]"
                >
                  Send test email
                </h2>
                <p className="mt-0.5 text-sm text-black/50">
                  Uses your current form values (save separately to keep them).
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 shrink-0 px-0"
                aria-label="Close"
                disabled={testPending}
                onClick={() => setTestOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="email_chrome_test_to">Recipient</Label>
                <Input
                  id="email_chrome_test_to"
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                  disabled={testPending}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={testPending}
                  onClick={() => setTestOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={testPending || !testTo.trim()}
                  onClick={handleSendTest}
                >
                  {testPending ? "Sending…" : "Send test"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
