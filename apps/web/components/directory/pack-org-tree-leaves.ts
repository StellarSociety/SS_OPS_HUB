/** Pull people with no reports toward neighboring cards that sit in a wide team column.
 *
 * Never collapse the gap before a branch (negative margin on a leaf that has a
 * following team). That slides the next department left and overlaps people.
 * Leaves after a wide sibling may use margin-left when they are last / followed
 * by another leaf. Leaves before a wide sibling slide only their card.
 */

function cardIn(li: HTMLElement): HTMLElement | null {
  const person = li.querySelector(":scope > .dir-org-person");
  if (!(person instanceof HTMLElement)) return null;
  for (const node of person.querySelectorAll<HTMLElement>(".dir-org-node")) {
    if (node.closest(".dir-org-collabs")) continue;
    return node;
  }
  return null;
}

function isLeaf(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.classList.contains("dir-org-leaf");
}

function isBranch(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && !el.classList.contains("dir-org-leaf");
}

function assignStyle(
  el: HTMLElement,
  key: "marginLeft" | "marginRight",
  value: string,
) {
  if (el.style[key] !== value) el.style[key] = value;
}

function assignProp(el: HTMLElement, name: string, value: string) {
  const current = el.style.getPropertyValue(name);
  if (current === value) return;
  if (value) el.style.setProperty(name, value);
  else el.style.removeProperty(name);
}

function scaleOf(root: HTMLElement): number {
  const width = root.getBoundingClientRect().width;
  return width / (root.offsetWidth || 1) || 1;
}

function cardBox(card: HTMLElement, root: HTMLElement, scale: number) {
  const a = card.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return {
    l: (a.left - o.left) / scale,
    r: (a.right - o.left) / scale,
  };
}

function liDepth(li: HTMLElement): number {
  let depth = 0;
  let cur: HTMLElement | null = li;
  while (cur) {
    if (cur.tagName === "LI") depth += 1;
    cur = cur.parentElement;
  }
  return depth;
}

function roomBetween(left: HTMLElement, right: HTMLElement, root: HTMLElement, scale: number) {
  const a = personIn(left);
  const b = personIn(right);
  if (!a || !b) return 0;
  return Math.round(cardBox(b, root, scale).l - cardBox(a, root, scale).r - CARD_GAP);
}

function personIn(li: HTMLElement): HTMLElement | null {
  const person = li.querySelector(":scope > .dir-org-person");
  return person instanceof HTMLElement ? person : null;
}

/** Layout pixels between sibling people. Viewport-pixel gaps shrink as the
 * tree zooms in, so highlighted (w-44) cards look stacked in fullscreen. */
const CARD_GAP = 32;

export function packOrgTreeLeaves(root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>(".dir-org-tree li")];

  for (const li of items) {
    li.classList.toggle("dir-org-leaf", !li.querySelector(":scope > ul"));
    assignStyle(li, "marginLeft", "");
    assignStyle(li, "marginRight", "");
    assignProp(li, "--dir-org-leaf-shift", "");
    assignProp(li, "--dir-org-next-pull", "");
    assignProp(li, "--dir-org-prev-pull", "");
    assignProp(li, "--dir-org-card-center", "");
    const person = li.querySelector<HTMLElement>(":scope > .dir-org-person");
    if (person) {
      person.style.left = "";
      assignProp(person, "--dir-org-person-shift", "");
    }
    const label = li.querySelector<HTMLElement>(
      ":scope > .dir-org-person > .dir-org-card-stack > .dir-org-label",
    );
    if (label) label.style.top = "";
  }
  for (const ul of root.querySelectorAll<HTMLElement>(".dir-org-tree li > ul")) {
    assignProp(ul, "--dir-org-stem-x", "");
    assignProp(ul, "--dir-org-bar-left", "");
    assignProp(ul, "--dir-org-bar-width", "");
  }

  void root.offsetWidth;
  const scale = scaleOf(root);

  const leaves = items
    .filter((li) => li.classList.contains("dir-org-leaf") && cardIn(li))
    .sort((a, b) => liDepth(b) - liDepth(a));

  for (const li of leaves) {
    const prev = li.previousElementSibling;
    const next = li.nextElementSibling;
    const prevBranch = isBranch(prev);
    const nextBranch = isBranch(next);

    let pullLeft = 0;
    let shift = 0;

    if (prevBranch && !nextBranch) {
      pullLeft = Math.max(0, roomBetween(prev, li, root, scale));
    } else if (nextBranch && !prevBranch) {
      shift = Math.max(0, roomBetween(li, next, root, scale));
    }

    assignStyle(li, "marginLeft", pullLeft ? `${-pullLeft}px` : "");
    assignProp(li, "--dir-org-leaf-shift", shift ? `${shift}px` : "");
    if (pullLeft) void root.offsetWidth;
  }

  for (const li of items) {
    const next = li.nextElementSibling;
    const nextPull =
      isLeaf(next) && next.style.marginLeft.startsWith("-")
        ? next.style.marginLeft.slice(1)
        : "";
    assignProp(li, "--dir-org-next-pull", nextPull);
  }

  separateOverlappingCards(root);
  spaceSiblingPeople(root, scaleOf(root));
  centerLabeledLevels(root, scaleOf(root));
  spaceSiblingPeople(root, scaleOf(root));
  // Slide managers toward their team, but never onto a sibling. That shift
  // is position:relative and does not widen the column, so a leaf packed
  // into the same row (Yusuf next to an expanded Shuhrat) would sit under
  // the card. Clamp the slide, push siblings, then redraw T-bars only.
  alignOrgTreeConnectors(root, scaleOf(root), true);
  spaceSiblingPeople(root, scaleOf(root));
  // Parent slides are relative and leave leftover air on one side of a
  // manager (Yusuf↔Shuhrat vs Shuhrat↔Tasmia). Pull leaves back to CARD_GAP.
  closeLeafGaps(root, scaleOf(root));
  spaceSiblingPeople(root, scaleOf(root));
  syncNextPull(root);
  separateOverlappingCards(root);
  alignOrgTreeConnectors(root, scaleOf(root), false);
  alignSiblingLabelTops(root, scaleOf(root));
}

function syncNextPull(root: HTMLElement) {
  for (const li of root.querySelectorAll<HTMLElement>(".dir-org-tree li")) {
    const next = li.nextElementSibling;
    const nextPull =
      isLeaf(next) && next.style.marginLeft.startsWith("-")
        ? next.style.marginLeft.slice(1)
        : "";
    assignProp(li, "--dir-org-next-pull", nextPull);
  }
}

function slideLeaf(li: HTMLElement, delta: number) {
  if (!delta) return;
  const shift =
    Number.parseFloat(li.style.getPropertyValue("--dir-org-leaf-shift")) || 0;
  const margin = Number.parseFloat(li.style.marginLeft) || 0;
  // Negative margin pulls the column; leaf-shift slides only the card.
  // Prefer the channel this leaf already uses so T-bars stay on the person.
  if (margin < 0 || (margin !== 0 && shift === 0)) {
    assignStyle(li, "marginLeft", `${margin + delta}px`);
    return;
  }
  const next = shift + delta;
  assignProp(li, "--dir-org-leaf-shift", next ? `${next}px` : "");
}

/** After a manager card slides, leftover space on one side of the row is
 * closed by moving only the neighboring leaf — never the wide team column. */
function closeLeafGaps(root: HTMLElement, scale: number) {
  const rows: HTMLElement[] = [
    root.querySelector<HTMLElement>(".dir-org-tree"),
    ...root.querySelectorAll<HTMLElement>(".dir-org-tree li > ul"),
  ].filter((el): el is HTMLElement => Boolean(el));

  for (const row of rows) {
    const kids = [...row.children]
      .filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "LI",
      )
      .sort((a, b) => {
        const aa = personVisualBox(a);
        const bb = personVisualBox(b);
        return (aa?.left ?? 0) - (bb?.left ?? 0);
      });
    for (let i = 0; i < kids.length - 1; i++) {
      const left = kids[i];
      const right = kids[i + 1];
      const a = personVisualBox(left);
      const b = personVisualBox(right);
      if (!a || !b) continue;
      const extra = Math.floor((b.left - a.right) / scale - CARD_GAP);
      if (extra <= 0) continue;
      if (isLeaf(left) && !isLeaf(right)) {
        slideLeaf(left, extra);
        void root.offsetWidth;
      } else if (!isLeaf(left) && isLeaf(right)) {
        slideLeaf(right, -extra);
        void root.offsetWidth;
      }
    }
  }
}

/** Keep department badges on one horizontal line across each sibling row. */
function alignSiblingLabelTops(root: HTMLElement, scale: number) {
  const rows: HTMLElement[] = [
    root.querySelector<HTMLElement>(".dir-org-tree"),
    ...root.querySelectorAll<HTMLElement>(".dir-org-tree li > ul"),
  ].filter((el): el is HTMLElement => Boolean(el));

  for (const row of rows) {
    const labels: HTMLElement[] = [];
    for (const child of row.children) {
      if (!(child instanceof HTMLElement) || child.tagName !== "LI") continue;
      if (!child.classList.contains("dir-org-row-labels")) continue;
      const label = child.querySelector<HTMLElement>(
        ":scope > .dir-org-person > .dir-org-card-stack > .dir-org-label",
      );
      if (label) labels.push(label);
    }
    if (labels.length < 2) continue;

    const tops = labels.map((label) => label.getBoundingClientRect().top);
    const target = Math.min(...tops);
    for (const label of labels) {
      const top = label.getBoundingClientRect().top;
      const delta = (target - top) / scale;
      if (Math.abs(delta) < 0.5) continue;
      const current =
        Number.parseFloat(label.style.getPropertyValue("top")) ||
        Number.parseFloat(getComputedStyle(label).top) ||
        0;
      label.style.top = `${current + delta}px`;
    }
  }
}

function hasOwnLabel(li: HTMLElement): boolean {
  const person = li.querySelector(":scope > .dir-org-person");
  if (!(person instanceof HTMLElement)) return false;
  return Boolean(person.querySelector(":scope .dir-org-label"));
}

function closestLabeled(li: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = li;
  while (cur) {
    if (cur.tagName === "LI" && hasOwnLabel(cur)) return cur;
    if (cur.classList.contains("dir-org-tree")) break;
    cur = cur.parentElement;
  }
  return null;
}

function depthFrom(li: HTMLElement, ancestor: HTMLElement): number {
  let depth = 0;
  let cur: HTMLElement | null = li;
  while (cur && cur !== ancestor) {
    if (cur.tagName === "LI") depth += 1;
    cur = cur.parentElement;
  }
  return depth;
}

function cardEdges(persons: HTMLElement[]): number[] {
  const edges: number[] = [];
  for (const person of persons) {
    const li = person.parentElement;
    const card = li instanceof HTMLElement ? cardIn(li) : null;
    if (!card) continue;
    const rect = card.getBoundingClientRect();
    edges.push(rect.left, rect.right);
  }
  return edges;
}

function shiftPersons(persons: HTMLElement[], delta: number) {
  if (!delta) return;
  for (const person of persons) {
    const current =
      Number.parseFloat(person.style.getPropertyValue("--dir-org-person-shift")) || 0;
    assignProp(person, "--dir-org-person-shift", `${current + delta}px`);
  }
}

function parentCardOf(person: HTMLElement): HTMLElement | null {
  const li = person.parentElement;
  if (!(li instanceof HTMLElement)) return null;
  const parentUl = li.parentElement;
  const parentLi = parentUl?.parentElement;
  if (!(parentLi instanceof HTMLElement) || parentLi.tagName !== "LI") return null;
  return cardIn(parentLi);
}

/** Under a department label, keep each row of people on the same center line. */
function centerLabeledLevels(root: HTMLElement, scale: number) {
  const depts = [...root.querySelectorAll<HTMLElement>(".dir-org-tree li")].filter(
    hasOwnLabel,
  );
  depts.sort((a, b) => liDepth(b) - liDepth(a));

  for (const dept of depts) {
    const levels = new Map<number, HTMLElement[]>();

    const add = (li: HTMLElement, depth: number) => {
      const person = li.querySelector<HTMLElement>(":scope > .dir-org-person");
      if (!person || !cardIn(li)) return;
      const row = levels.get(depth) ?? [];
      row.push(person);
      levels.set(depth, row);
    };

    add(dept, 0);
    for (const li of dept.querySelectorAll<HTMLElement>(":scope li")) {
      if (closestLabeled(li) !== dept) continue;
      add(li, depthFrom(li, dept));
    }

    const allPeople = [...levels.values()].flat();
    const allEdges = cardEdges(allPeople);
    if (allEdges.length < 2) continue;
    const axis = (Math.min(...allEdges) + Math.max(...allEdges)) / 2;

    const centerOn = (persons: HTMLElement[], target: number) => {
      const edges = cardEdges(persons);
      if (edges.length < 2) return;
      shiftPersons(
        persons,
        Math.round((target - (Math.min(...edges) + Math.max(...edges)) / 2) / scale),
      );
    };

    for (const persons of levels.values()) {
      if (persons.length >= 2) centerOn(persons, axis);
    }
    const head = levels.get(0);
    if (head?.length === 1) centerOn(head, axis);

    for (const depth of [...levels.keys()].sort((a, b) => a - b)) {
      if (depth === 0) continue;
      const persons = levels.get(depth);
      if (!persons || persons.length !== 1) continue;
      const parent = parentCardOf(persons[0]);
      if (!parent) continue;
      const box = parent.getBoundingClientRect();
      centerOn(persons, (box.left + box.right) / 2);
    }
  }
}

function clampParentShift(
  parentLi: HTMLElement,
  parentCard: HTMLElement,
  shift: number,
  scale: number,
): number {
  if (!shift) return 0;
  const row = parentLi.parentElement;
  if (!row) return shift;
  const siblings = [...row.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "LI",
  );
  const idx = siblings.indexOf(parentLi);
  const box = parentCard.getBoundingClientRect();
  const gap = CARD_GAP * scale;
  if (shift > 0 && idx < siblings.length - 1) {
    const next = personVisualBox(siblings[idx + 1]);
    if (next) {
      const room = Math.floor((next.left - gap - box.right) / scale);
      shift = Math.min(shift, Math.max(0, room));
    }
  } else if (shift < 0 && idx > 0) {
    const prev = personVisualBox(siblings[idx - 1]);
    if (prev) {
      const room = Math.floor((box.left - gap - prev.right) / scale);
      shift = Math.max(shift, -Math.max(0, room));
    }
  }
  return shift;
}

/** Draw T-bars through the people, and drop the parent stem onto that bar. */
function alignOrgTreeConnectors(
  root: HTMLElement,
  scale: number,
  moveParents = true,
) {
  const uls = [...root.querySelectorAll<HTMLElement>(".dir-org-tree li > ul")];
  uls.sort(
    (a, b) =>
      liDepth(b.parentElement as HTMLElement) -
      liDepth(a.parentElement as HTMLElement),
  );

  for (const ul of uls) {
    const parentLi = ul.parentElement;
    if (!(parentLi instanceof HTMLElement)) continue;
    const kids = [...ul.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "LI",
    );
    const ulLeft = ul.getBoundingClientRect().left;
    const centers: number[] = [];

    for (const li of kids) {
      const card = cardIn(li);
      if (!card) continue;
      const box = card.getBoundingClientRect();
      const liLeft = li.getBoundingClientRect().left;
      const mid = ((box.left + box.right) / 2 - ulLeft) / scale;
      const local = ((box.left + box.right) / 2 - liLeft) / scale;
      assignProp(li, "--dir-org-card-center", `${Math.round(local)}px`);
      centers.push(mid);
    }
    if (centers.length === 0) continue;

    const first = Math.min(...centers);
    const last = Math.max(...centers);
    const kidsMid = (first + last) / 2;

    const parentCard = cardIn(parentLi);
    const parentPerson = parentLi.querySelector<HTMLElement>(
      ":scope > .dir-org-person",
    );
    if (
      moveParents &&
      parentCard &&
      parentPerson &&
      !closestLabeled(parentLi)
    ) {
      const parentBox = parentCard.getBoundingClientRect();
      const parentMid = ((parentBox.left + parentBox.right) / 2 - ulLeft) / scale;
      const shift = clampParentShift(
        parentLi,
        parentCard,
        Math.round(kidsMid - parentMid),
        scale,
      );
      if (shift) {
        const current =
          Number.parseFloat(
            parentPerson.style.getPropertyValue("--dir-org-person-shift"),
          ) || 0;
        assignProp(parentPerson, "--dir-org-person-shift", `${current + shift}px`);
      }
    }

    const stemCard = cardIn(parentLi);
    const stem =
      stemCard != null
        ? ((stemCard.getBoundingClientRect().left +
            stemCard.getBoundingClientRect().right) /
            2 -
            ulLeft) /
          scale
        : kidsMid;
    const barLeft = Math.min(first, stem);
    const barRight = Math.max(last, stem);
    assignProp(ul, "--dir-org-bar-left", `${Math.round(barLeft)}px`);
    assignProp(ul, "--dir-org-bar-width", `${Math.round(barRight - barLeft)}px`);
    assignProp(ul, "--dir-org-stem-x", `${Math.round(stem)}px`);
  }
}

function nodeBox(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { el, l: r.left, r: r.right, t: r.top, b: r.bottom };
}

function employeeCards(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(".dir-org-tree .dir-org-person .dir-org-node"),
  ].filter((el) => {
    // Skip "+ Report" ghost placeholders; keep main cards and side collabs.
    if (el.tagName === "BUTTON") return false;
    return true;
  });
}

function personVisualBox(li: HTMLElement) {
  const person = personIn(li);
  if (!person) return null;
  const cards = [
    ...person.querySelectorAll<HTMLElement>(":scope .dir-org-node"),
  ].filter((el) => el.tagName !== "BUTTON");
  const rects = (cards.length > 0 ? cards : [person]).map((el) =>
    el.getBoundingClientRect(),
  );
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    right: Math.max(...rects.map((rect) => rect.right)),
  };
}

/** Push sibling columns apart when person rows (including side collabs) collide. */
function spaceSiblingPeople(root: HTMLElement, scale: number) {
  const rows: HTMLElement[] = [
    root.querySelector<HTMLElement>(".dir-org-tree"),
    ...root.querySelectorAll<HTMLElement>(".dir-org-tree li > ul"),
  ].filter((el): el is HTMLElement => Boolean(el));

  for (const row of rows) {
    const kids = [...row.children].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "LI",
    );
    for (let i = 0; i < kids.length - 1; i++) {
      const a = personVisualBox(kids[i]);
      const b = personVisualBox(kids[i + 1]);
      if (!a || !b) continue;
      const need = Math.ceil((a.right - b.left) / scale + CARD_GAP);
      if (need <= 0) continue;
      const current = Number.parseFloat(kids[i + 1].style.marginLeft) || 0;
      assignStyle(kids[i + 1], "marginLeft", `${current + need}px`);
      void root.offsetWidth;
    }
  }
}

function separateOverlappingCards(root: HTMLElement) {
  const cards = employeeCards(root);
  if (cards.length < 2) return;

  const HIT = 4;
  for (let pass = 0; pass < 6; pass++) {
    const boxes = cards.map(nodeBox);
    let hit = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox <= HIT || oy <= HIT) continue;
        hit = true;
        if (!relaxLeaf(a.el) && !relaxLeaf(b.el)) return;
        void root.offsetWidth;
      }
    }
    if (!hit) return;
  }
}

/** Undo a leaf slide/pull that caused a card collision. */
function relaxLeaf(from: HTMLElement): boolean {
  const leaf = from.closest("li.dir-org-leaf");
  if (!(leaf instanceof HTMLElement)) return false;
  const shift = Number.parseFloat(leaf.style.getPropertyValue("--dir-org-leaf-shift"));
  if (shift > 0) {
    const next = Math.floor(shift * 0.5);
    assignProp(leaf, "--dir-org-leaf-shift", next ? `${next}px` : "");
    return true;
  }
  const margin = Number.parseFloat(leaf.style.marginLeft);
  if (margin < 0) {
    const next = Math.ceil(margin * 0.5);
    assignStyle(leaf, "marginLeft", next ? `${next}px` : "");
    const prev = leaf.previousElementSibling;
    if (prev instanceof HTMLElement) {
      assignProp(prev, "--dir-org-next-pull", next ? `${-next}px` : "");
    }
    return true;
  }
  return false;
}
