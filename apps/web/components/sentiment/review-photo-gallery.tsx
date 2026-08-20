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
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col items-center"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={`${altPrefix} photo ${index + 1}`}
          className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
        />
        <p className="mt-3 text-sm text-white/80">
          {index + 1} / {photos.length}
        </p>
        <button
          type="button"
          className="absolute right-0 top-0 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70",
              )}
              aria-label="Previous photo"
              onClick={() =>
                onIndexChange((index + photos.length - 1) % photos.length)
              }
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Next photo"
              onClick={() => onIndexChange((index + 1) % photos.length)}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
