"use client";

import { GuestFeedbackSocialIcon } from "@/components/sentiment/guest-feedback-social-icon";
import type { GuestFeedbackOutboundLink } from "@/lib/sentiment/guest-feedback/types";

export function GuestFeedbackSocialLinks({
  links,
}: {
  links: GuestFeedbackOutboundLink[];
}) {
  if (links.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[#3D421F]">Find us online</p>
      <ul className="flex flex-wrap justify-center gap-3">
        {links.map((link) => (
          <li key={link.key}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-[4.5rem] flex-col items-center gap-1.5 text-[#3D421F] transition hover:opacity-80"
            >
              <GuestFeedbackSocialIcon icon={link.icon} />
              <span className="text-[11px] font-medium leading-tight">
                {link.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
