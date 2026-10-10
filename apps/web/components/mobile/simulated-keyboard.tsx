"use client";

import { ArrowBigUp, CornerDownLeft, Delete, Globe, Mic, Smile } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

type Editable = HTMLTextAreaElement | HTMLInputElement;

function editableTarget(el: Element | null): Editable | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (
    el instanceof HTMLInputElement &&
    !["button", "checkbox", "radio", "range", "submit", "file", "color"].includes(el.type)
  ) {
    return el;
  }
  return null;
}

/** Set a React-controlled field's value the way typing would. */
function setNativeValue(el: Editable, value: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Device-simulator screen with a phone keyboard: focusing a text field slides
 * a keyboard up from the bottom and the screen above it shrinks, so fields
 * like the chat box rise above it — as on a real phone. The keys type into the
 * focused field (your computer keyboard works too).
 */
export function SimulatedKeyboardFrame({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(false);
  const field = useRef<Editable | null>(null);

  function press(key: string) {
    const el = field.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    if (key === "backspace") {
      const from = start === end ? Math.max(0, start - 1) : start;
      setNativeValue(el, el.value.slice(0, from) + el.value.slice(end), from);
      if (!el.value) setShift(true);
      return;
    }
    if (key === "enter") {
      // Let the field decide (chat composers send on Enter).
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      // After a send the field is empty again: capitalise the next message.
      window.setTimeout(() => setShift(!el.value), 0);
      return;
    }
    const text = key === "space" ? " " : shift ? key.toUpperCase() : key;
    setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end), start + text.length);
    if (shift) setShift(false);
  }

  // Keys must not take focus away from the field.
  function onKey(e: MouseEvent, key: string) {
    e.preventDefault();
    press(key);
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onFocusCapture={(e) => {
        const el = editableTarget(e.target as Element);
        if (el) {
          field.current = el;
          setOpen(true);
          // Like iOS: start a message with a capital letter.
          setShift(!el.value);
        }
      }}
      onBlurCapture={() => {
        // Wait for focus to land, then close unless it moved to another field.
        window.setTimeout(() => {
          const next = editableTarget(document.activeElement);
          if (next) field.current = next;
          else setOpen(false);
        }, 0);
      }}
    >
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">{children}</div>
      </div>
      <div
        aria-hidden
        className={cn(
          "shrink-0 overflow-hidden transition-[height] duration-200 ease-out",
          open ? "h-[42%]" : "h-0",
        )}
      >
        {/* iOS-style keyboard: frosted panel, rounded top, big keys. */}
        <div className="flex h-full flex-col rounded-t-[22px] bg-[#D5D8DE]/95 px-[1.2%] pt-[3%] shadow-[0_-1px_0_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <div className="flex flex-1 flex-col justify-start gap-[2.6%]">
            {ROWS.map((row, i) => (
              <div key={row} className={cn("flex justify-center gap-[1.4%]", i === 1 && "px-[5%]")}>
                {i === 2 ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShift((v) => !v);
                    }}
                    className={cn(
                      "mr-[3%] flex h-11 w-[11%] items-center justify-center rounded-[9px] shadow-[0_1px_0_rgba(0,0,0,0.25)]",
                      shift ? "bg-white text-black" : "bg-[#ADB3BC] text-black",
                    )}
                  >
                    <ArrowBigUp className={cn("h-5 w-5", shift && "fill-black")} />
                  </button>
                ) : null}
                {row.split("").map((k) => (
                  <button
                    key={k}
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => onKey(e, k)}
                    className="h-11 w-[8.8%] rounded-[9px] bg-white text-[21px] font-normal text-black shadow-[0_1px_0_rgba(0,0,0,0.25)] active:bg-[#ADB3BC]"
                  >
                    {shift ? k.toUpperCase() : k}
                  </button>
                ))}
                {i === 2 ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => onKey(e, "backspace")}
                    className="ml-[3%] flex h-11 w-[11%] items-center justify-center rounded-[9px] bg-[#ADB3BC] shadow-[0_1px_0_rgba(0,0,0,0.25)] active:bg-white"
                  >
                    <Delete className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            ))}
            <div className="flex justify-center gap-[1.4%]">
              <span className="flex h-11 w-[12%] items-center justify-center rounded-[9px] bg-[#ADB3BC] text-[15px] text-black shadow-[0_1px_0_rgba(0,0,0,0.25)]">
                123
              </span>
              <span className="flex h-11 w-[11%] items-center justify-center rounded-[9px] bg-[#ADB3BC] shadow-[0_1px_0_rgba(0,0,0,0.25)]">
                <Smile className="h-5 w-5" />
              </span>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => onKey(e, "space")}
                className="h-11 flex-1 rounded-[9px] bg-white text-[15px] text-black/50 shadow-[0_1px_0_rgba(0,0,0,0.25)] active:bg-[#ADB3BC]"
              >
                space
              </button>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => onKey(e, "enter")}
                className="flex h-11 w-[24%] items-center justify-center rounded-[9px] bg-[#ADB3BC] shadow-[0_1px_0_rgba(0,0,0,0.25)] active:bg-white"
              >
                <CornerDownLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
          {/* Globe / dictation strip under the keys (decorative). */}
          <div className="flex shrink-0 items-center justify-between px-[6%] pb-[5%] pt-[2%] text-black/80">
            <Globe className="h-6 w-6" strokeWidth={1.6} />
            <Mic className="h-6 w-6" strokeWidth={1.6} />
          </div>
        </div>
      </div>
    </div>
  );
}
