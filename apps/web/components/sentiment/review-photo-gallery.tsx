"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReviewPhotoStrip({
  photos,
  altPrefix,
}: {
  photos: string[];
  altPrefix: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {photos.map((src, photoIndex) => (
          <button
            key={src}
            type="button"
            className="relative h-16 w-16 overflow-hidden rounded-md border border-black/10 bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40]"
            onClick={() => setIndex(photoIndex)}
            aria-label={`Open photo ${photoIndex + 1} of ${photos.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {index != null ? (
        <ReviewPhotoGallery
          photos={photos}
          altPrefix={altPrefix}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setIndex(null)}
        />
      ) : null}
    </>
  );
}

function ReviewPhotoGallery({
  photos,
  altPrefix,
  index,
  onIndexChange,
  onClose,
}: {
  photos: string[];
  altPrefix: string;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const current = photos[index] ?? photos[0];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        onIndexChange((index + photos.length - 1) % photos.length);
      }
      if (event.key === "ArrowRight") {
        onIndexChange((index + 1) % photos.length);
      }
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [index, onClose, onIndexChange, photos.length]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/75 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-zoom-out"
        aria-label="Close gallery"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review photos"
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col items-center gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="self-end rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex min-h-0 w-full items-center justify-center gap-3">
          {photos.length > 1 ? (
            <button
              type="button"
              className="shrink-0 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Previous photo"
              onClick={() =>
                onIndexChange((index + photos.length - 1) % photos.length)
              }
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current}
            alt={`${altPrefix} photo ${index + 1}`}
            className="max-h-[68vh] w-auto max-w-[min(100%,52rem)] rounded-lg object-contain shadow-2xl"
          />

          {photos.length > 1 ? (
            <button
              type="button"
              className="shrink-0 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Next photo"
              onClick={() => onIndexChange((index + 1) % photos.length)}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
        </div>

        {photos.length > 1 ? (
          <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-1">
            {photos.map((src, photoIndex) => {
              const selected = photoIndex === index;
              return (
                <button
                  key={src}
                  type="button"
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                    selected
                      ? "border-white"
                      : "border-transparent opacity-70 hover:opacity-100",
                  )}
                  onClick={() => onIndexChange(photoIndex)}
                  aria-label={`Show photo ${photoIndex + 1} of ${photos.length}`}
                  aria-current={selected ? "true" : undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
        ) : null}

        <p className="text-sm text-white/80">
          {index + 1} / {photos.length}
        </p>
      </div>
    </div>,
    document.body,
  );
}
