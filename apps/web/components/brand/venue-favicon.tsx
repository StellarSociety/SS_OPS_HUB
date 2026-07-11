"use client";

import { useEffect } from "react";

type VenueFaviconProps = {
  url: string | null;
};

export function VenueFavicon({ url }: VenueFaviconProps) {
  useEffect(() => {
    const selector = 'link[rel="icon"][data-venue-branding="true"]';
    let link = document.querySelector<HTMLLinkElement>(selector);

    if (!url) {
      link?.remove();
      return;
    }

    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute("data-venue-branding", "true");
      document.head.appendChild(link);
    }

    link.href = url;
    link.type = url.endsWith(".svg") ? "image/svg+xml" : "image/png";
  }, [url]);

  return null;
}
