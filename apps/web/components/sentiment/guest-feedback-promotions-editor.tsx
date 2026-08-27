"use client";

import { useEffect, useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  removeGuestFeedbackPromotion,
  reorderGuestFeedbackPromotions,
  saveGuestFeedbackPromotion,
  setGuestFeedbackPromotionVisible,
} from "@/lib/actions/guest-feedback";
import {
  isPromotionLive,
  todayIsoInDubai,
  type GuestFeedbackPromotion,
} from "@/lib/sentiment/guest-feedback/types";
import { cn } from "@/lib/utils";

export function GuestFeedbackPromotionsEditor({
  promotions,
  canEdit,
}: {
  promotions: GuestFeedbackPromotion[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ordered, setOrdered] = useState(promotions);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reorderPending, startReorder] = useTransition();
  const today = todayIsoInDubai();
  const canDrag = canEdit && !adding && !editingId && !reorderPending && !pending;

  useEffect(() => {
    setOrdered(promotions);
  }, [promotions]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId || !canDrag) return;
    const from = ordered.findIndex((item) => item.id === draggedId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrdered(next);

    startReorder(async () => {
      const result = await reorderGuestFeedbackPromotions(next.map((item) => item.id));
      if (!result.ok) {
        toast.error(result.error);
        setOrdered(promotions);
        return;
      }
      refresh();
    });
  }

  function toggleVisible(promo: GuestFeedbackPromotion, visible: boolean) {
    const previous = ordered;
    setOrdered((current) =>
      current.map((item) => (item.id === promo.id ? { ...item, visible } : item)),
    );
    startTransition(async () => {
      const result = await setGuestFeedbackPromotionVisible(promo.id, visible);
      if (!result.ok) {
        toast.error(result.error);
        setOrdered(previous);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        Tick a promotion to show or hide it on the guest page. Drag the handle to
        change the order. Only ticked promotions that are in date appear
        publicly — turn one off, or set dates, to take it off the public page
        without deleting it.
      </p>
      <ul className="space-y-3">
        {ordered.map((promo, index) => (
          <li
            key={promo.id}
            onDragOver={(event) => {
              if (!canDrag || !dragId) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!dragId) return;
              reorder(dragId, promo.id);
              setDragId(null);
            }}
          >
            {editingId === promo.id ? (
              <PromotionForm
                promo={promo}
                sortOrder={(index + 1) * 10}
                busy={pending}
                onCancel={() => setEditingId(null)}
                onSave={(formData) => {
                  startTransition(async () => {
                    const result = await saveGuestFeedbackPromotion(formData);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.saved("Promotion saved.");
                    setEditingId(null);
                    refresh();
                  });
                }}
              />
            ) : (
              <PromotionRow
                promo={promo}
                canEdit={canEdit}
                canDrag={canDrag}
                dragging={dragId === promo.id}
                busy={pending || reorderPending}
                live={isPromotionLive(promo, today)}
                onDragStart={() => setDragId(promo.id)}
                onDragEnd={() => setDragId(null)}
                onToggleVisible={(visible) => toggleVisible(promo, visible)}
                onEdit={() => setEditingId(promo.id)}
                onChanged={refresh}
              />
            )}
          </li>
        ))}
      </ul>
      {canEdit && adding ? (
        <PromotionForm
          sortOrder={(ordered.length + 1) * 10}
          busy={pending}
          onCancel={() => setAdding(false)}
          onSave={(formData) => {
            startTransition(async () => {
              const result = await saveGuestFeedbackPromotion(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.saved("Promotion saved.");
              setAdding(false);
              refresh();
            });
          }}
        />
      ) : null}
      {canEdit && !adding ? (
        <Button type="button" onClick={() => setAdding(true)} disabled={pending}>
          Add promotion
        </Button>
      ) : null}
    </div>
  );
}

function PromotionRow({
  promo,
  canEdit,
  canDrag,
  dragging,
  busy,
  live,
  onDragStart,
  onDragEnd,
  onToggleVisible,
  onEdit,
  onChanged,
}: {
  promo: GuestFeedbackPromotion;
  canEdit: boolean;
  canDrag: boolean;
  dragging: boolean;
  busy: boolean;
  live: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleVisible: (visible: boolean) => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Card
      className={cn(
        "overflow-hidden",
        !live && "opacity-60",
        dragging && "bg-[var(--venue-secondary,#F0F3DD)]/40",
      )}
    >
      <div className="flex flex-col sm:flex-row">
        {promo.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={promo.image_url}
            alt=""
            className="h-36 w-full object-cover sm:h-auto sm:w-40"
          />
        ) : null}
        <div className="flex flex-1 flex-wrap items-start justify-between gap-3 p-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {canEdit ? (
              <div className="mt-1 flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  draggable={canDrag}
                  disabled={!canDrag}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  className={cn(
                    "cursor-grab rounded p-1 text-black/35 transition hover:bg-black/5 hover:text-[#3D421F] active:cursor-grabbing",
                    !canDrag && "cursor-not-allowed opacity-40",
                  )}
                  title={canDrag ? "Drag to reorder" : "Finish editing to reorder"}
                  aria-label={`Reorder ${promo.title}`}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm text-[#3D421F]"
                  title="Show on guest page when in date"
                >
                  <input
                    type="checkbox"
                    checked={promo.visible}
                    disabled={busy || pending}
                    onChange={(event) => onToggleVisible(event.target.checked)}
                    className="h-4 w-4 rounded border-black/25 accent-[#3D421F]"
                    aria-label={`Show ${promo.title} on guest page`}
                  />
                  <span className="sr-only sm:not-sr-only sm:text-xs sm:font-medium sm:uppercase sm:tracking-wide sm:text-black/45">
                    Visible
                  </span>
                </label>
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="font-serif text-xl text-[#3D421F]">{promo.title}</p>
              <p className="mt-1 text-sm text-black/55">
                {live ? "Visible on guest page" : "Not currently shown"}
                {promo.value_label ? ` · ${promo.value_label}` : ""}
                {promo.starts_on || promo.ends_on
                  ? ` · ${promo.starts_on ?? "…"} to ${promo.ends_on ?? "…"}`
                  : ""}
              </p>
              {promo.description ? (
                <p className="mt-2 text-sm text-black/60">{promo.description}</p>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || pending}
                onClick={onEdit}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await removeGuestFeedbackPromotion(promo.id);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.saved("Promotion removed.");
                    onChanged();
                  });
                }}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function PromotionForm({
  promo,
  sortOrder,
  busy,
  onCancel,
  onSave,
}: {
  promo?: GuestFeedbackPromotion;
  sortOrder: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (formData: FormData) => void;
}) {
  const [startsOn, setStartsOn] = useState(promo?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(promo?.ends_on ?? "");

  return (
    <Card className="space-y-4 p-5">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(new FormData(event.currentTarget));
        }}
      >
        {promo ? <input type="hidden" name="id" value={promo.id} /> : null}
        <input type="hidden" name="sort_order" value={sortOrder} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`p-title-${promo?.id ?? "new"}`}>Title</Label>
            <Input
              id={`p-title-${promo?.id ?? "new"}`}
              name="title"
              defaultValue={promo?.title ?? ""}
              disabled={busy}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`p-value-${promo?.id ?? "new"}`}>Offer label</Label>
            <Input
              id={`p-value-${promo?.id ?? "new"}`}
              name="value_label"
              placeholder="20% off"
              defaultValue={promo?.value_label ?? ""}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`p-desc-${promo?.id ?? "new"}`}>Description</Label>
            <Textarea
              id={`p-desc-${promo?.id ?? "new"}`}
              name="description"
              defaultValue={promo?.description ?? ""}
              disabled={busy}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`p-start-${promo?.id ?? "new"}`}>Starts</Label>
            <DateInput
              id={`p-start-${promo?.id ?? "new"}`}
              name="starts_on"
              value={startsOn}
              onChange={setStartsOn}
              disabled={busy}
              className="w-full"
              inputClassName="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`p-end-${promo?.id ?? "new"}`}>Ends</Label>
            <DateInput
              id={`p-end-${promo?.id ?? "new"}`}
              name="ends_on"
              value={endsOn}
              onChange={setEndsOn}
              disabled={busy}
              className="w-full"
              inputClassName="h-10"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`p-image-${promo?.id ?? "new"}`}>Image</Label>
            <Input
              id={`p-image-${promo?.id ?? "new"}`}
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={busy}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            name="visible"
            defaultChecked={promo?.visible ?? true}
            value="on"
            disabled={busy}
          />
          Visible when in date
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
