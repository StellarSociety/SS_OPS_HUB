"use client";

import { useEffect, useState } from "react";
import { getMentionPeople } from "@/lib/actions/connect-mentions";
import { encodeMentions } from "@/lib/connect/mentions";
import type { ConnectPerson } from "@/lib/connect/types";

// One fetch per page load, shared by every composer.
let cache: ConnectPerson[] | null = null;
let inflight: Promise<ConnectPerson[]> | null = null;

function loadMentionPeople(): Promise<ConnectPerson[]> {
  if (cache) return Promise.resolve(cache);
  inflight ??= getMentionPeople()
    .then((people) => {
      cache = people;
      return people;
    })
    .catch(() => {
      inflight = null;
      return [];
    });
  return inflight;
}

/** Venue people for the @ picker (loaded once, then shared). */
export function useMentionPeople(): ConnectPerson[] {
  const [people, setPeople] = useState<ConnectPerson[]>(() => cache ?? []);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    void loadMentionPeople().then((list) => {
      if (alive) setPeople(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  return people;
}

/**
 * Turn typed "@Full Name" into stored mention tokens before sending. Uses the
 * shared people list; extra people (e.g. chat members) can be passed in.
 */
export function encodeTypedMentions(text: string, extra: ConnectPerson[] = []): string {
  return encodeMentions(text, [...extra, ...(cache ?? [])]);
}
