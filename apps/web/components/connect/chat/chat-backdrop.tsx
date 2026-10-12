"use client";

/**
 * Plain chat background, behind the scrolling messages (phone, Connecteam
 * page and the chats popup). Just the base colour from `.chat-wallpaper` —
 * no pattern — so received (white) bubbles still stand out, and it matches
 * the chat-opening loader.
 */
export function ChatBackdrop() {
  return <div aria-hidden className="chat-wallpaper pointer-events-none absolute inset-0" />;
}
