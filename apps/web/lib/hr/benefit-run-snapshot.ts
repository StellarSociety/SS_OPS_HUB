/**
 * PNG snapshot of a benefit run's summary (cards + Total tips / Collections /
 * Department shares). Clones the on-page elements into an off-screen frame
 * with a title and run details, then renders it with html2canvas.
 */
import { downloadElementAsPng } from "@/lib/hr/promotions-snapshot";

export type SnapshotDetail = { label: string; value: string };

const SNAPSHOT_WIDTH = 1400;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Inputs become plain text, sort buttons in table headers become their label,
 * other buttons / marked controls are dropped, and scroll areas are expanded.
 */
function staticClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]) {
    if (/overflow-|max-h-/.test(node.getAttribute("class") ?? "")) {
      node.style.overflow = "visible";
      node.style.maxHeight = "none";
    }
  }
  const originals = Array.from(source.querySelectorAll("input, select"));
  Array.from(clone.querySelectorAll("input, select")).forEach((field, i) => {
    const original = originals[i] as HTMLInputElement | HTMLSelectElement | undefined;
    if (original instanceof HTMLInputElement && original.type === "checkbox") {
      if (original.checked) {
        const tick = document.createElement("span");
        tick.className = "font-semibold text-[#3D421F]";
        tick.textContent = "✓";
        field.replaceWith(tick);
      } else {
        // An unticked option's label says nothing useful in a snapshot.
        (field.closest("label") ?? field).remove();
      }
      return;
    }
    const value =
      original instanceof HTMLSelectElement
        ? (original.selectedOptions[0]?.textContent ?? "")
        : (original?.value ?? "");
    const span = document.createElement("span");
    span.className = "inline-block min-w-10 whitespace-nowrap rounded-md border border-black/10 px-2 py-0.5 text-center tabular-nums";
    span.textContent = value;
    field.replaceWith(span);
  });
  clone.querySelectorAll("th button").forEach((button) => {
    const label = document.createElement("span");
    label.textContent = button.textContent ?? "";
    button.replaceWith(label);
  });
  clone.querySelectorAll("button, [data-snapshot-hide]").forEach((node) => node.remove());
  return clone;
}

export async function exportBenefitRunSnapshot(input: {
  source: HTMLElement;
  title: string;
  details: SnapshotDetail[];
  logoUrl: string | null;
  filename: string;
  /** Policy text shown under the table (e.g. Tip Out / Distribution Policy). */
  policy?: { title: string; content: HTMLElement } | null;
}): Promise<void> {
  const frame = el("div", {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${Math.max(SNAPSHOT_WIDTH, input.source.scrollWidth + 64)}px`,
    padding: "32px",
    background: "#fbfaf6",
    boxSizing: "border-box",
  });

  const header = el("div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    paddingBottom: "20px",
    marginBottom: "24px",
    borderBottom: "1px solid rgba(0,0,0,0.1)",
  });
  const heading = el("div", {});
  heading.appendChild(
    el(
      "h1",
      { margin: "0", fontSize: "28px", color: "#3D421F", lineHeight: "1.2" },
      input.title,
    ),
  );
  heading.firstElementChild?.classList.add("font-serif");
  const detailRow = el("div", {
    display: "flex",
    flexWrap: "wrap",
    columnGap: "24px",
    rowGap: "4px",
    marginTop: "10px",
    fontSize: "13px",
    color: "rgba(0,0,0,0.6)",
  });
  for (const detail of input.details) {
    const item = el("span", {});
    item.appendChild(el("span", { color: "rgba(0,0,0,0.45)" }, `${detail.label}: `));
    item.appendChild(el("span", { color: "#3D421F", fontWeight: "600" }, detail.value));
    detailRow.appendChild(item);
  }
  heading.appendChild(detailRow);
  header.appendChild(heading);
  if (input.logoUrl) {
    const logo = el("img", { height: "44px", width: "auto", objectFit: "contain" });
    logo.src = input.logoUrl;
    logo.alt = "";
    header.appendChild(logo);
  }

  frame.appendChild(header);
  frame.appendChild(staticClone(input.source));
  if (input.policy) {
    const block = el("div", {
      marginTop: "24px",
      padding: "16px 20px",
      background: "#ffffff",
      border: "1px solid rgba(0,0,0,0.1)",
      borderRadius: "12px",
    });
    const title = el(
      "h2",
      { margin: "0 0 8px", fontSize: "18px", color: "#3D421F" },
      input.policy.title,
    );
    title.classList.add("font-serif");
    block.appendChild(title);
    const body = staticClone(input.policy.content);
    body.hidden = false;
    body.removeAttribute("hidden");
    body.className = "space-y-2 text-sm leading-relaxed text-black/60";
    block.appendChild(body);
    frame.appendChild(block);
  }
  document.body.appendChild(frame);
  try {
    await downloadElementAsPng(frame, input.filename);
  } finally {
    frame.remove();
  }
}
