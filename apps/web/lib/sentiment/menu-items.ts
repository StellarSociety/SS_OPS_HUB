export const MENU_ITEMS = [
  {
    key: "lasagna",
    label: "Lasagna",
    pattern: /\b(?:100[-\s]?layers?(?:ed)?\s+)?lasagn[ae]\b/i,
  },
  {
    key: "lamb-shoulder",
    label: "Lamb shoulder",
    pattern: /\blamb shoulder\b|\b(?:48\s*hours?\s+)?slow[-\s]?cooked lamb\b/i,
  },
  {
    key: "wagyu-cheek",
    label: "Wagyu cheek",
    pattern: /\bwagyu(?:\s+beef)?\s+cheek\b/i,
  },
  {
    key: "wagyu-steak",
    label: "Wagyu steak",
    pattern: /\bwagyu steak\b|\bwagyu with truffle\b/i,
  },
  {
    key: "beef-tartare",
    label: "Beef tartare",
    pattern: /\bbeef tartare\b/i,
  },
  {
    key: "tuna-tartare",
    label: "Tuna tartare",
    pattern: /\btuna tartare\b/i,
  },
  {
    key: "octopus",
    label: "Octopus",
    pattern: /\boctopus\b/i,
  },
  {
    key: "churros",
    label: "Churros",
    pattern: /\bchurros?\b/i,
  },
  {
    key: "croquettes",
    label: "Croquettes",
    pattern: /\bcroquettes?\b|\bbeef croquet\b/i,
  },
  {
    key: "parmigiana",
    label: "Parmigiana",
    pattern: /\bparmigian+a\b/i,
  },
  {
    key: "filet-mignon",
    label: "Filet mignon",
    pattern: /\bfil(?:l)?et mignon\b/i,
  },
  {
    key: "ribeye",
    label: "Ribeye",
    pattern: /\brib[\s-]?eye\b/i,
  },
  {
    key: "orzo",
    label: "Orzo",
    pattern: /\borzo\b/i,
  },
  {
    key: "shrimp",
    label: "Shrimp",
    pattern: /\bshrimps?\b|\bprawns?\b/i,
  },
  {
    key: "orecchiette",
    label: "Orecchiette",
    pattern: /\borecchiette\b|\brigate\s?pasta\b/i,
  },
  {
    key: "ravioli",
    label: "Ravioli",
    pattern: /\braviol(?:i|ini)\b/i,
  },
  {
    key: "black-cod",
    label: "Black cod",
    pattern: /\bblack cod\b/i,
  },
  {
    key: "chocolate-mousse",
    label: "Chocolate mousse",
    pattern: /\bchocolate mousse\b/i,
  },
  {
    key: "mille-feuille",
    label: "Mille-feuille",
    pattern: /\bmille[\s-]?feuille\b/i,
  },
  {
    key: "carpaccio",
    label: "Carpaccio",
    pattern: /\bcarpaccio\b/i,
  },
  {
    key: "calamari",
    label: "Calamari",
    pattern: /\bcalamari\b/i,
  },
  {
    key: "duck-salad",
    label: "Duck salad",
    pattern: /\bduck salad\b/i,
  },
  {
    key: "amalfi-cocktail",
    label: "Amalfi cocktail",
    pattern: /\bamalfi cocktail\b/i,
  },
  {
    key: "mussels",
    label: "Mussels",
    pattern: /\bmussels?\b/i,
  },
  {
    key: "katju-chicken",
    label: "Katju chicken",
    pattern: /\bkatju chicken\b/i,
  },
  {
    key: "steak",
    label: "Steak",
    pattern: /\bsteaks?\b/i,
  },
  {
    key: "pasta",
    label: "Pasta",
    pattern: /\bpastas?\b/i,
  },
] as const;

export type MenuItemKey = (typeof MENU_ITEMS)[number]["key"];
