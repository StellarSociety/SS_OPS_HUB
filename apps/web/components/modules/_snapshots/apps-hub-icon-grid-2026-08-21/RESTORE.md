# Apps Hub snapshot — iOS-style icon grid (21 Aug 2026)

Saved before the product-card redesign. The dashboard shortcut grid (`ModuleTile` / `ModuleGrid` / `ExpandableModuleGrid`) was **not** replaced; only the Apps Hub pages used this layout.

## Restore

Copy these files back over the live counterparts:

| Snapshot | Restore to |
|---|---|
| `hub-page.tsx` | `apps/web/app/(app)/modules/page.tsx` |
| `category-page.tsx` | `apps/web/app/(app)/modules/[category]/page.tsx` |
| `modules-overview.tsx` | `apps/web/components/modules/modules-overview.tsx` |
| `module-explanations.tsx` | `apps/web/components/modules/module-explanations.tsx` |
| `module-grid.tsx` | `apps/web/components/modules/module-grid.tsx` |
| `module-tile.tsx` | `apps/web/components/modules/module-tile.tsx` |

Then remove the newer showcase files if they exist:

- `apps/web/components/modules/apps-hub-stage.tsx`

The snapshot folder is excluded from TypeScript (`apps/web/tsconfig.json`) so it cannot drift against the live props.
