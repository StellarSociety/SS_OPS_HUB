# SS Ops Copilot — Scope & Design (Deferred)

> **Status: NOT being developed yet.** This is a captured design/scope only, saved for
> future reference. Do not start implementation until explicitly requested.
> Captured: 2026-07-12.

## Goal

An in-app AI assistant ("SS Ops Copilot") that answers questions about the app's
operational data — figures, explanations, trend analysis, forecasts, and formatted
(exportable) reports — using the sales, HR, and venue data already in Supabase Postgres.

The user can ask anything and the bot provides real figures, narrative explanations,
trend analysis, trend-based forecasts, and beautifully presented reports.

## Why the stack is a good fit

- Next.js 16 + React 19
- `recharts` already installed (charts)
- `jspdf` / `jspdf-autotable` / `xlsx` already installed (report export)
- Rich structured sales/HR schema in Supabase
- Pre-built pure aggregation helpers (see below)
- Vercel AI Gateway key already provisioned in `.env.local` (`AI_GATEWAY_API_KEY`)

No teardown required — it slots into the existing module + permission system.

## Core architectural decision (DECIDED)

**Tool-calling** (function calling), NOT text-to-SQL and NOT dumping raw data into the
prompt. The LLM chooses which typed tool to call; each tool runs existing deterministic
aggregation code and returns typed JSON numbers. **The LLM never invents figures** — it
only narrates real numbers returned by tools.

Confirmed choices from the discussion:
- Tool-calling + deterministic math computed in code (not by the LLM)
- Priority domain for v1: **Sales & Revenue**
- Delivered as a **dedicated AI Copilot module** (`/copilot`)

## LLM provider decision (DECIDED)

- **Generation (the bot's brain):** Vercel AI Gateway (GPT / Claude / Gemini) via the
  existing `AI_GATEWAY_API_KEY`. Zero markup, ~$5/month free credits, one-line model swap.
- **Data (the bot's knowledge):** Supabase, queried through the aggregation tools.
- Rejected options and why:
  - **ChatGPT / Codex subscription** → cannot be used; it's a consumer product with no
    API key. Using OpenAI models programmatically needs a separate pay-as-you-go API key
    from `platform.openai.com`.
  - **Supabase AI** → not an LLM provider for generation. It offers free embeddings
    (`gte-small`) + `pgvector` for semantic search, and self-hosted/invite-only LLM
    inference only. Useful *later* for semantic search over free-text notes, not for v1.
- Make the model a **single swappable config constant**. Later cost levers: prompt
  caching (~90% off repeated system prompt) and routing simple lookups to a cheaper model.
- Rough cost estimate: ~$6–15/month on a budget model, ~$30–45/month on a premium model
  at internal-team usage; $5/month free credit may cover light usage.

## Flow

```
User asks a question in /copilot
        │
        ▼
POST /api/copilot  (streaming route, like the existing cron route pattern)
        │
        ├─ resolve active venue (ss-active-venue cookie) + user + permissions
        │
        ▼
Vercel AI SDK  streamText({ model: gateway, tools: [...], messages })
        │
        ├─ LLM decides which TOOL(s) to call ────────────┐
        │                                                │  each tool:
        │   getSalesOverview(monthKey?)                  │   1. checks has_feature_permission
        │   getSalesTrend(weeks?)                        │   2. fetches rows via server client (RLS)
        │   getYearToDateMonthly()                       │   3. runs existing aggregation fn
        │   getAverageSpend(monthKey?)                   │   4. runs deterministic trend/forecast math
        │   getForecastVsActual(year?)                   │   5. returns typed JSON (numbers only)
        │   getDiscountInsights(range?)                  │
        │   getWaiterPerformance(range?)                 │
        │                                                │
        ◄────────────── tool results (real figures) ─────┘
        │
        ▼
LLM writes explanation/narrative around the REAL numbers
        │
        ▼
Streamed answer + structured "artifacts" (chart specs, tables)
        │
        ▼
UI renders: streamed text + recharts charts + tables
                                    │
                                    └─ "Export report" → jsPDF / xlsx (already installed)
```

## Pieces to build

### 1. Dependencies (additions to `apps/web`)

```bash
pnpm --filter @ss-ops-hub/web add ai @ai-sdk/react zod
```

- `ai` — Vercel AI SDK (`streamText`, `tool`), routes through the AI Gateway via
  `AI_GATEWAY_API_KEY`. No separate OpenAI/Anthropic key needed.
- `@ai-sdk/react` — `useChat` hook for the frontend.
- `zod` — typed tool parameter schemas (safe input validation).

### 2. Tool layer — `apps/web/lib/copilot/tools.ts`

A registry of typed tools; each is a thin, permission-checked wrapper around existing
aggregation code. Example shape:

```typescript
getSalesOverview: tool({
  description: "Month-to-date revenue, covers, ASPH & average party size vs. previous month for the active venue.",
  inputSchema: z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  execute: async ({ monthKey }) => {
    await requireFeature("sales", "venue_daily", "view");        // reuse permission helper
    const rows = await loadEnrichedDailyRows(activeVenueId);      // reuse sales store
    return buildOverviewHeadlineStats(rows, monthKey ?? current, previous); // existing fn
  },
})
```

Existing aggregation helpers to wrap (already pure functions returning structured analytics):
- `buildOverviewHeadlineStats`, `buildWeeklySalesTrend`, `buildYearToDateMonthlyTrend`,
  `buildAverageSpendInsights`, `buildForecastYearView`
- Source files: `sales-overview-aggregations.ts`, `forecast-aggregations.ts`,
  `discounts-insights-aggregations.ts`, `waiter-sales-insights-aggregations.ts`

### 3. Deterministic trend/forecast math — `apps/web/lib/copilot/trends.ts`

Real statistics on top of the figures (LLM interprets/narrates, does NOT compute):
- **Trend:** linear regression slope + R² over weekly / YTD monthly trend output.
- **Forecast:** moving-average and linear projection for next period; blended with
  existing `venue_monthly_forecasts` targets via `buildForecastYearView` (variance).
- **Comparisons:** period-over-period and YoY deltas (gap-to-beat / surplus already computed).

### 4. Streaming API route — `apps/web/app/api/copilot/route.ts`

Follows existing `api/cron/notifications/route.ts` conventions (`force-dynamic`,
`maxDuration`). Resolves venue + user, builds a system prompt (business context, current
venue, date, available tools, "never fabricate figures" guardrail), calls `streamText`.

### 5. UI module — `apps/web/app/(app)/copilot/page.tsx` + components

- Chat interface using `useChat`, styled with existing `components/ui` + `framer-motion`.
- Inline **recharts** rendering when a tool returns chart data (trend lines, comparison
  bars, forecast-vs-actual).
- **Report export** button → `jspdf` + `jspdf-autotable` (PDF) and `xlsx` (Excel).
- Suggested prompt chips ("How's revenue this month?", "Forecast next month",
  "Top waiters last week", "Where are discounts leaking?").

### 6. Module registration & security

- Add a `copilot` entry to `lib/modules-catalog.ts` + `lib/modules-registry.ts` with a
  new `module_key: 'copilot'`, so it plugs into `venue_modules` per-venue toggle and the
  `user_permissions` access model.
- Gate `/copilot` and `/api/copilot` in `middleware.ts`.
- Add an RLS/permission entry so only authorized users see it.
- Optional: log each interaction to `audit_log` via `lib/audit.ts`.

## Security model

- Route uses the **user-scoped server client** (`lib/supabase/server.ts`), so **RLS
  automatically filters to what the user is allowed to see** — the bot cannot read data
  the user couldn't read in the UI.
- Each tool additionally calls the `has_feature_permission` mirror before running.
- Scoped to the **active venue cookie** by default (Global aggregation only if the user
  has `canAccessGlobal()`).
- **No text-to-SQL**, so no injection surface into the DB.

## v1 capabilities (Sales & Revenue)

- **Figures:** "What's our MTD revenue?", "Covers last week?", "Average spend per head for wine this month?"
- **Explanations:** "Why is revenue down vs last month?" → pulls breakdown and narrates drivers.
- **Trends:** "Show me the 12-week sales trend" → regression + recharts line chart.
- **Forecasts:** "Project next month's revenue" → deterministic projection + forecast targets, with confidence caveats.
- **Reports:** "Give me a monthly performance report" → structured, formatted, exportable to PDF/Excel.

HR (staff expiries, headcount, salary cost) and cross-module reports follow as **v2**
using the identical pattern.

## Rollout in phases

1. **Foundation** — deps, AI Gateway wiring, one tool (`getSalesOverview`), minimal chat
   route + page. Prove end-to-end streaming works on localhost.
2. **Tool suite** — remaining sales tools + trend/forecast math.
3. **Visualization** — inline recharts + suggested prompts.
4. **Reports & export** — PDF/Excel generation.
5. **Module registration, permissions, audit logging, polish.**

## Future (v2/v3) enhancements

- Supabase **free embeddings + `pgvector`** for semantic search over free-text fields
  (e.g. `venue_daily_snap_notes.service_comments`, `86` notes, waiter comments):
  "find days where service comments mentioned slow kitchen". Not needed for v1.
- HR domain tools; cross-module reports.

## Notes

- No schema changes required for v1.
- Reuses existing aggregation, charting, export, permission, and audit infrastructure.
