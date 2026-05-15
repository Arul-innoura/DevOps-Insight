# Figma AI Prompt — DevOps Insight (a.k.a. ShipIt) Enterprise UI/UX Design Brief

> Paste this **entire document** into Figma AI / Figma Make / Galileo AI / any AI-driven design tool. It contains every constraint, design token, component, page, and interaction needed to produce an enterprise-grade design system and the complete application interface.

---

## 1. Product Overview

**Product name:** DevOps Insight (internal codename: **ShipIt**)
**Type:** Enterprise web application — internal DevOps portal
**Tenant:** Encipher Health (single-tenant SaaS, Azure AD authentication)
**Primary purpose:** Real-time visibility, cost control, and operational management of a multi-cloud Kubernetes platform (Azure AKS + AWS EKS) used by 10–30 product teams.

The application sits between Kubernetes / Prometheus / Azure / AWS on the data side and engineering / DevOps / finance / management roles on the human side. Every screen must feel like a **mission-critical dashboard** — data-dense, scan-first, but visually calm. Think Datadog, Grafana Cloud, Vercel Dashboard, Linear, and Stripe Dashboard for tone and rhythm.

**Design goal:** Trustworthy, modern, slightly clinical (healthcare context), no playful illustrations, no marketing fluff. **Information density is a feature.** Whitespace exists to make the dense data legible, not to fill space.

---

## 2. Target Users & Roles

Four roles are first-class. Every screen must declare which role(s) see it. Hide, don't disable, role-locked features.

| Role | Title shown in UI | Primary intent | Tone of UI for this role |
|---|---|---|---|
| `user` | "User" | Sees own product's environment status; opens tickets | Friendly, low-density, large CTAs |
| `devops` | "DevOps" | Owns infra; toggles cycles; analyses cost; live builds | Power-user, high-density, keyboard-friendly |
| `admin` | "Admin" | Configures projects, envs, cloud resources, integrations | Forms-heavy, sober, lots of guard-rails |
| `manager` | "Manager" | Approval workflows, sign-off, monthly cost reports | Executive feel, summary cards, exportable |

Roles can be combined (a user can be `devops + admin`). The app shell shows a role-switcher when the logged-in identity holds multiple roles.

---

## 3. Brand & Identity

### 3.1 Logo & wordmark
- Wordmark: **"DevOps Insight"** in semibold, set in the primary font.
- Logo mark: a simple geometric glyph — abstracted "DI" monogram or a single rotating ring with three dots representing dev / qa / prod. Render at 16 / 20 / 24 / 32 / 48 px. Keep flat, single-colour, two variants (positive on light, negative on dark).
- Strapline (optional, only on login screen): *"Shipping with confidence."*

### 3.2 Personality dial
- Serious: 8/10
- Modern: 9/10
- Playful: 1/10
- Dense: 9/10
- Friendly: 4/10
- Technical: 10/10

If any AI suggests illustrations of people, abstract gradients, marketing-style hero sections, or "fun" empty states, **reject them**. This is an internal tool — every pixel earns its place.

---

## 4. Design Tokens (the design system)

Generate these as Figma **variables** (Modes: `Light`, `Dark`). Use `--kebab-case` naming. Provide a Tokens Studio JSON export.

### 4.1 Colour — neutrals (light → dark)

| Token | Light | Dark |
|---|---|---|
| `bg-canvas` | `#F8F9FC` | `#0B1020` |
| `bg-surface` | `#FFFFFF` | `#111733` |
| `bg-surface-alt` | `#FAFBFD` | `#161D3D` |
| `bg-elevated` | `#FFFFFF` | `#1B2247` |
| `border-default` | `#E2E6EE` | `#293052` |
| `border-strong` | `#CBD5E1` | `#3B4575` |
| `border-subtle` | `#EEF1F6` | `#212949` |
| `text-primary` | `#0F172A` | `#F1F5F9` |
| `text-secondary` | `#475569` | `#94A3B8` |
| `text-muted` | `#94A3B8` | `#64748B` |
| `text-inverse` | `#FFFFFF` | `#0F172A` |

### 4.2 Colour — brand & semantic

| Token | Light | Dark | Usage |
|---|---|---|---|
| `brand-primary` | `#1D4ED8` | `#3B82F6` | Primary buttons, focused state, links |
| `brand-primary-soft` | `#EFF6FF` | `#1E3A8A40` | Selected rows, ghost button hover |
| `success` | `#059669` | `#10B981` | Success toast, positive deltas, healthy badges |
| `success-soft` | `#DCFCE7` | `#064E3B66` | Success backgrounds |
| `warning` | `#B45309` | `#F59E0B` | Warn pills, stale data badge |
| `warning-soft` | `#FEF3C7` | `#78350F66` | Warning backgrounds |
| `danger` | `#DC2626` | `#EF4444` | Errors, destructive actions, prod tag |
| `danger-soft` | `#FEE2E2` | `#7F1D1D66` | Error backgrounds |
| `info` | `#2563EB` | `#60A5FA` | Info banners |
| `info-soft` | `#DBEAFE` | `#1E3A8A66` | Info backgrounds |

### 4.3 Colour — environment tags (CRITICAL, cross-app)

Used consistently in every chart, pill, badge, and tab.

| Environment | Dot / Stroke | Soft fill |
|---|---|---|
| `dev` | `#10B981` (emerald) | `#10B98120` |
| `qa` | `#3B82F6` (blue) | `#3B82F620` |
| `test` | `#0EA5E9` (sky) | `#0EA5E920` |
| `uat` | `#F59E0B` (amber) | `#F59E0B20` |
| `stage` / `staging` | `#A855F7` (violet) | `#A855F720` |
| `preprod` | `#EC4899` (pink) | `#EC489920` |
| `prod` / `production` | `#EF4444` (red) | `#EF444420` |
| `sandbox` | `#14B8A6` (teal) | `#14B8A620` |

Fallback palette (used when env count exceeds the table above):
`#06B6D4, #22C55E, #F97316, #8B5CF6, #EAB308, #F43F5E, #84CC16`.

### 4.4 Colour — chart categories (component breakdown)

| Category | Hex |
|---|---|
| compute | `#3B82F6` |
| memory | `#A855F7` |
| storage | `#F59E0B` |
| network | `#EC4899` |
| registry | `#8B5CF6` |
| egress | `#F97316` |
| control-plane | `#6366F1` |
| system-vms | `#6366F1` |
| user-vms | `#22C55E` |
| spot-vms | `#F97316` |
| wastage | `#EF4444` |
| database | `#06B6D4` |
| support | `#14B8A6` |

### 4.5 Typography

- **Primary sans:** **Inter** (variable). Fallback: `system-ui, -apple-system, "Segoe UI", Roboto`.
- **Monospace:** **JetBrains Mono** for numbers in tables, code, region tags, monetary values that need precise alignment. Fallback: `ui-monospace, "SF Mono", Menlo`.
- **Numeric tabular numerals everywhere** that money or counts appear (`font-feature-settings: 'tnum' 1`).

Type ramp (rem-based, but Figma should use px equivalents at 16 px root):

| Token | Size / Line / Weight | Use |
|---|---|---|
| `text-xs` | 11 / 16 / 500 | Pills, badges, table headers |
| `text-sm` | 12 / 18 / 400 | Tables, secondary text |
| `text-base` | 13 / 20 / 400 | Body, default UI |
| `text-md` | 14 / 22 / 500 | Section labels, menu items |
| `text-lg` | 16 / 24 / 600 | Card titles, KPI labels |
| `text-xl` | 20 / 28 / 700 | Page headings, KPI numbers |
| `text-2xl` | 24 / 32 / 700 | Dashboard hero numbers |
| `text-3xl` | 32 / 40 / 700 | Login hero |

Uppercase labels: 10 / 14 / 600, letter-spacing 0.04em, colour `text-secondary`. Used for filter labels, table headers, mini-card labels.

### 4.6 Spacing scale (4-px base)

`space-0 = 0, 1 = 2, 2 = 4, 3 = 6, 4 = 8, 5 = 10, 6 = 12, 7 = 14, 8 = 16, 9 = 20, 10 = 24, 11 = 32, 12 = 40, 13 = 48, 14 = 64`.

### 4.7 Border radius

| Token | Value | Use |
|---|---|---|
| `radius-xs` | 4 | Inline chips inside dense rows |
| `radius-sm` | 6 | Inputs, small buttons |
| `radius-md` | 7 | Default buttons, selects |
| `radius-lg` | 8 | Inputs, KPI cards |
| `radius-xl` | 10 | Panels, dialog cards |
| `radius-2xl` | 14 | Marketing-style hero cards (rare) |
| `radius-pill` | 9999 | Pills, env tags, status dots |

### 4.8 Elevation / shadow

| Token | Value (light) | Use |
|---|---|---|
| `elev-0` | none | Inline elements |
| `elev-1` | `0 1px 2px rgba(15,23,42,0.04)` | Sticky bars, default panels |
| `elev-2` | `0 2px 6px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)` | Popovers, dropdowns |
| `elev-3` | `0 8px 24px rgba(15,23,42,0.12)` | Modals, command palette |
| `elev-4` | `0 18px 40px rgba(15,23,42,0.18)` | Drawer right panels |

In dark mode use cool-blue-tinted shadows instead of black to avoid muddy depth.

### 4.9 Motion

- Duration tokens: `motion-fast = 100ms, motion-base = 150ms, motion-slow = 250ms, motion-slower = 400ms`.
- Easing: default `cubic-bezier(0.4, 0, 0.2, 1)`. Enter: `cubic-bezier(0, 0, 0.2, 1)`. Exit: `cubic-bezier(0.4, 0, 1, 1)`.
- Skeleton shimmer: 1.4 s linear infinite.
- Pulse for "live" indicators (refreshing, running cycle): 1.6 s ease-in-out infinite, fade between 0.5 and 1.
- Spin (refresh icon): 1 s linear infinite while loading.
- Reduced-motion: respect `prefers-reduced-motion`; replace all transitions with instant state swaps.

### 4.10 Iconography
- Library: **Lucide React** — single-source for the whole app.
- Stroke width: 1.5 default, 2 inside small (12 px) badges.
- Size scale: 12 (inline text), 14 (controls), 16 (page headings), 18 (top nav), 20 (empty states).
- Never mix icon sets. Never use filled glyphs alongside stroke icons.

---

## 5. Component Library

Build each as a Figma **component** with **variants** for size, state, intent, and theme. Every component must have at least these states: `Default · Hover · Focused · Active · Disabled · Loading` and `Light · Dark` themes.

### 5.1 Atoms

#### Buttons
- **Variants:** `primary`, `secondary`, `ghost`, `outline`, `danger`, `success`.
- **Sizes:** `sm` (28 px), `md` (32 px), `lg` (40 px).
- **Layout:** leading icon (optional) + label + trailing icon (optional). Loading state shows a spinning `RefreshCw` icon and disables clicks.
- **Primary spec:** `bg-brand-primary`, white text, `radius-md`, font 13/600, padding 6/12 (md). Hover: `brand-primary` shifted −5% lightness. Focus ring: 2 px `brand-primary` offset 2 px. Disabled: 60 % opacity.
- **Ghost button:** transparent bg, border `border-strong`, text `text-primary`. Hover: `bg-surface-alt`. Used 80 % of the time across this app.
- **Icon-only button:** square, same heights, tooltip required.

#### Inputs
- **Text input, select, date input, datetime-local, textarea, file:**
  - Height: 32 (sm), 36 (md), 40 (lg)
  - Padding: 6/10
  - Border: 1 px `border-strong`
  - Focus: ring 2 px `brand-primary` + border `brand-primary`
  - Error: border `danger`, helper text `danger`
  - Prefix/suffix slot (icon, unit like "USD", "GB")
  - Always associate with a `<label>` (10 px uppercase) — never use placeholder as label

#### Pills (filter chips, env tags, status badges)
- Pill radius (full). Padding 2/8. Font 11/600. Optional 8 px coloured dot (for env). States: default (border + tinted bg), active (solid bg with role colour, white text).
- Variants by intent: neutral / brand / success / warning / danger / info / category-specific (compute, memory, storage…).

#### Tags
- Smaller and sharper than pills. Radius-xs. Used inside dense tables.

#### Status dot
- 6 / 8 / 10 px filled circle. Optional pulsing animation when "live".

#### Avatar
- Circle 24 / 32 / 40 px. Initials fallback. Show role badge in bottom-right.

#### Tooltip
- Black 90 % bg in light mode, white text, 11 px, padding 6/8. Always show on hover after 200 ms. Arrow 6 px. Position: top by default, flip on edge.

#### Skeleton
- `bg-surface-alt` with shimmer gradient. Same shape as the element it replaces.

### 5.2 Molecules

#### KPI Card
- 180–220 px wide, 96 px tall.
- Top: small icon in a 28 × 28 tinted square + uppercase label.
- Centre: large number (20 px / 700, tabular).
- Bottom: optional sub-text (11 px, `text-muted`).
- A 3-px coloured strip across the top reflects intent (success / brand / warning / danger).

#### Filter group
- Pill cluster: label (uppercase) + scrollable pill row + optional "All" master pill.
- Used heavily across Cost Management, Cluster Cost, Env Monitoring.

#### Date-range chip group
- Six chips: `Live · Today · 7 days · 30 days · Year · Custom`. Custom expands inline to two `datetime-local` inputs separated by an arrow.
- The active chip uses warning-soft fill (amber chips), because date is "special" and should stand out from neutral filters. Keep this convention everywhere.

#### Search input
- 32 px height, leading search icon, placeholder "Filter table…", debounced 200 ms when filtering large tables.

#### Tabs
- Underline-style tabs (not pill tabs). 14 px / 600. Active: brand-primary underline 2 px + matching text colour.
- Used for `Environment | Resource | Project | Cost Monitoring | Cost Management` on the role landing page.

#### Tooltip-rich legend
- Coloured dot + label + value + optional extra. Used to caption every chart.

#### Stat row
- A horizontal line of mini-stats (label / value pairs) separated by 16 px. Used inside expanded panels.

### 5.3 Organisms

#### Top Nav (app shell)
- Sticky 56 px header.
- Left: logo + product wordmark + role switcher (only when multi-role).
- Centre: top-level nav links — `Dashboard · Environments · Cost · Builds · Tickets · Admin` (visibility depends on role).
- Right: global search (Cmd/Ctrl-K), notifications bell with red dot, user avatar dropdown.
- Background: `bg-surface` with bottom border `border-default`.

#### Side Nav (admin section only)
- 240 px wide, collapsible to 56 px icon-only.
- Sections: `General · Projects · Environments · Cloud Resources · Integrations · Users · Audit Log`.

#### Sticky Filter Bar
- The most reused organism. White bg, border, `elev-1`, `radius-xl`, padding 10/14.
- Two rows: row 1 = controls (env pills, scope select, search, spacer, date chips, refresh, reset). Row 2 = status text + active-filter chips.
- Must remain sticky to top of scrollable container. On mobile, controls wrap to multiple rows.

#### Data Table
- Header row: uppercase 10 px labels, `bg-surface-alt`, sortable carets `▲/▼`.
- Body rows: 36 px tall. Hover: `bg-surface-alt`. Selected row: brand-primary-soft.
- Cells: right-aligned for numbers, left for text. Tabular numerals.
- System rows muted (text `text-muted`, italic).
- Inline tags inside cells: env tag, product tag, status pill.
- Empty state cell-row: centred microcopy, optional CTA.
- Sticky first column when horizontally scrolled.

#### Panel / Card
- White bg, border `border-default`, top border 3 px coloured strip (intent), `radius-xl`.
- Header (40 px): icon + title + subtitle on right.
- Body: padding 12/14.

#### Modal / Dialog
- Centre overlay, `bg-elevated`, `elev-3`, `radius-xl`, max-width 560 px (default), 720 px (form), 920 px (data).
- Sticky header with close (×). Sticky footer with `Cancel + Confirm` buttons (right-aligned).

#### Drawer (right side)
- Right slide-in 480 / 640 / 920 px. Used for inspecting a single namespace, ticket, or build run.

#### Toast / Notification
- Top-right stack, max 4 visible. 4 s auto-dismiss for success/info, sticky for error.
- `success` (green), `error` (red), `info` (blue), `warning` (amber) variants.

#### Command palette
- Cmd/Ctrl-K opens it. Centred dialog, search input at top, recent + suggested items below, fuzzy-search across products / envs / pages.

### 5.4 Chart primitives (build as components)

All charts must be **SVG-based** (no chart library lock-in), with hover tooltips, accessible `<title>` elements, and respect colour tokens.

1. **Donut chart** — total in centre, slices coloured by env. Hover: a popover lists hourly / daily / monthly / pods / util.
2. **Horizontal bar list** — label + bar track + value. Supports segmented bars (one row stacked into env-coloured chunks).
3. **Stacked bar** — single horizontal bar showing % share of categories. Below: legend with values.
4. **Multi-line sparkline** — one polyline per env over time. Min-height 140 px. X-axis hidden, hover dots show timestamp + value.
5. **Single sparkline (area)** — for individual metrics in detail panels. Min-height 80 px.
6. **Utilisation bar** — 14 px tall bar with % text overlaid (mix-blend-mode: difference). Turns red above 90 %.
7. **Util gauge** — semicircular gauge for CPU / memory headline.
8. **Heatmap calendar** — for cost-per-day across a month (used in cost history view).
9. **Gantt bar** — for environment uptime timeline (start-time → end-time strips).

Every chart needs three modifier states: `loading` (skeleton), `empty` (microcopy + hint), `error` (icon + retry CTA).

---

## 6. Information Architecture

### 6.1 Top-level routes

```
/login                          (unauthenticated)
/                               (role-based redirect)
/dashboard                      (role-aware landing)
/environments                   (env uptime + monitoring)
/resources                      (pod / container metrics)
/projects                       (devops only)
/cost                           (cost management — single unified page)
/cost/monitoring                (legacy cycle tracker — devops only)
/cluster-cost                   (admin power view: overview/system/projects/resources/cost-history)
/builds                         (live CI/CD pipeline)
/tickets                        (support / incident)
/approvals                      (manager)
/admin                          (project / env / cloud / integrations / users / audit)
/profile                        (account, prefs, theme, notifications)
```

### 6.2 Navigation rules

- Role determines which links appear in the top nav.
- Deep links are first-class: `/cost?env=qa,dev&scope=product:FRONTEND&range=7d` must rehydrate full state.
- Breadcrumbs appear on every page below the header: `Cost › Frontend product › Detail`.

---

## 7. Page-by-page specifications

For each page below, design **all viewport sizes**: 1440 (desktop), 1024 (laptop), 768 (tablet), 390 (mobile). Cover empty, loading, error, and content states.

### 7.1 Login

Single centred card on a clean canvas. Logo at top, "Sign in to DevOps Insight" headline, single primary button **"Continue with Microsoft"** (full width, brand-primary). Below: a passive line "Encipher Health single sign-on". Footer: version, status link, support email. No password fields — Azure AD only.

States: idle, redirecting (button shows spinner + label "Redirecting to Microsoft…"), error banner above card if SSO failed.

### 7.2 App shell (post-login)

- 56 px sticky top nav (Section 5.3).
- Below: page region. Pages set their own background. Default `bg-canvas`.
- Bottom (sticky on mobile only): a 56 px tab bar with the 4 most relevant routes for the role.

### 7.3 Dashboard (role-aware landing)

**For `user`:** A welcome strip with avatar + name + product. Two large cards: "Your environments" (env uptime mini-cards with colour-coded status dots), "Your open tickets" (table, 5 most recent). Below: a knowledge-base prompt.

**For `devops`:** Six KPI cards across the top — Hourly $, Monthly $, MTD $, Active envs, Running pods, Open incidents. Below, in a 2-col grid: "Cost trend (last 7 d)" sparkline, "Live builds" list with progress bars. Bottom: a "What needs attention" panel listing crashlooping pods, stale data warnings, cycles left running too long.

**For `admin`:** Configuration health: count of configured projects, envs missing prices, integrations failing, last sync timestamps. Plus a panel showing recent admin audit entries.

**For `manager`:** Executive summary — monthly cost per product (bar), MTD vs forecast (delta), pending approvals (count + CTA). Exports: PDF + CSV buttons top-right.

### 7.4 Environment Monitoring

A Gantt-style timeline showing uptime per environment, per product, over a date range.

- Top filter bar: product select, env multi-select, date-range chips.
- Body: a vertical list of products. Each product row expands to show env strips (Gantt rows). Each strip is filled with coloured segments — uptime (env colour), downtime (grey), unknown (hatched).
- DevOps role gets per-env Start / Stop / Auto buttons on each row + a "running now" pulse dot.
- Click any env → drawer opens with cycle history table (start, end, duration, who triggered).

### 7.5 Resource Monitoring

Per-pod / per-container live metrics.

- Top filter: env, namespace, microservice, time window.
- KPI strip: CPU used / req / limit, Memory used / req / limit, restart count, crashloop count, p95 latency.
- Two stacked charts: CPU usage over time and memory usage over time, multi-line by pod (top 10).
- Bottom: a pod table with sortable cols (pod, node, status, CPU, mem, restarts, age).

### 7.6 Cost Management (the unified flagship view — designed in detail)

This is the most important page in the app. Design it pixel-perfect.

**Layout (top → bottom):**

1. **Sticky filter bar** (Section 5.3 — Sticky Filter Bar). Two rows:
   - Row 1, left → right:
     - Group "Environment": label + `All` master pill + one pill per env. Active pill = solid env colour with white text. Inactive = white bg, env-coloured border + dot.
     - Group "Scope": label + dropdown listing `All Products / Namespaces`, then optgroup `── Products ──`, then optgroup `── Namespaces ──`. Each option shows the live hourly cost.
     - Group "Search": magnifier + free text input (filters the bottom table).
     - Spacer.
     - Group "Date" (amber-tinted to stand out): label + the six date chips. When `Custom` is active, two `datetime-local` inputs slide in with a `→` arrow between them.
     - `Refresh` button (primary).
     - `Reset` button (ghost).
   - Row 2: a status strip showing `updated 12:34:56 · auto-refresh 60 s` and any active-filter pill summaries (`env: QA, DEV`, `product: FRONTEND`).

2. **KPI strip** — 6 KPI cards (Section 5.2): Live hourly, Projected monthly, Month-to-date, Environments (with subline listing env names), Namespaces / Pods, Lifetime cumulative.

3. **Overview mode** (when scope = All): three columns of charts.
   - **Donut "Cost split by environment"** — env-coloured slices + centre total. Legend below with `ENV · %` and a smaller monthly figure.
   - **Top products bar list** — top 10 products. Each row is a horizontal segmented bar coloured by env share inside that product. Click row to drill in.
   - **Component cost rollup** — horizontal bars per category (compute, memory, storage, network, registry, egress, control-plane, overhead). Each bar coloured per category token.
   - Below, full-width: **Hourly cost trend** multi-line sparkline (one line per env, env-coloured) and **Resource utilisation cards** (one card per env, CPU bar + memory bar).
   - Below that: **Environment summary table** — sortable columns: Env (tag) · Hourly · Daily · Monthly · MTD · Nodes · CPU util (bar) · Mem util (bar) · Wastage % · Pods · Namespaces.

4. **Scope drill-down mode** (when a product or namespace is selected): replaces the overview region with:
   - A scope header card with 6 headline values (Hourly, Monthly, MTD, CPU used, Memory, Pods).
   - **9 Category tiles** in a responsive grid (min 230 px wide):
     - `Cost · CPU · Memory · Storage · Network · Resources · Usage · Performance · Efficiency`
     - Each tile shows: icon in tinted square + category name + chevron + three headline lines (label + value).
     - Click a tile → expands a detail panel below the grid with **15–20 metric mini-cards**, plus inline sub-tables and sparklines (e.g. PVC inventory, top CPU consumers, microservice list, hourly trend).
   - For Product scope, also: a "Namespaces in this product" sub-table.

5. **Namespace table (always at bottom)** — every namespace across the active envs, sortable columns: Env tag · Namespace (with `system` tag for infra) · Product tag · Pods · CPU used · Memory used · CPU req · Mem req · Hourly · Monthly · MTD. Click row → set namespace scope.

**State coverage:**
- Loading: skeleton KPI strip + skeleton donut + skeleton table.
- Empty (no env selected, no data): friendly empty-state card with an alert icon + suggestion to select different env.
- Error: red banner above KPIs with retry button.
- Stale data: orange "Stale data" badge in filter bar status line.

### 7.7 Cost Monitoring (legacy cycle tracker — keep separate)

Existing functionality — Azure cloud-service start/stop tracker. List of services with start/stop buttons, a real-time cumulative cost line, and a cycle history bar chart. Re-skin to match the design system but do not redesign behaviour.

### 7.8 Cluster Cost Dashboard (admin power view)

Admin-only deep dive. Page navigation with **5 sub-tabs**: `Overview · System · Projects · Resources · Cost History`. Each sub-tab has its own dense layout with stats grids and tables similar to Datadog's "Cost" tab.

Top bar: env switcher (single env at a time), `Live usage / Fixed cost` toggle, refresh, audit toggle.

Pages:
- **Overview** — cluster totals card, component breakdown stack-bar, top consumers, reconciliation pass/fail badges.
- **System** — system pool detail (control plane, system VMs, disks).
- **Projects** — proportional cost per product with drilldowns.
- **Resources** — per-node detail, VM SKU breakdown, OS disk tier breakdown.
- **Cost History** — time-series chart with filter window (Live / Date / Month / Year / Custom) and granularity (auto / minute / hour / day / month).

### 7.9 Live Build View

Pipeline live runs (CI/CD).

- Top: filter by repo / branch / status.
- Body: list of runs as cards. Each card = repo · branch · commit msg · author avatar · status pill (queued / running / passed / failed) · duration · timeline strip of build stages (clone → compile → test → deploy) each stage coloured.
- Click a run → drawer with log stream (monospaced, virtualised), step list, artifacts.

### 7.10 Tickets

A Linear / Jira-lite layout.

- Left filter rail: status (Open / In progress / Blocked / Done), priority, assignee, label.
- Centre: ticket table — Title · Status pill · Priority dot · Assignee avatar · Updated.
- Right (when selected): detail drawer with description (markdown), comments thread, attachments, activity log.
- New-ticket modal with rich-text editor.

### 7.11 Manager Approval

Card list of pending approvals. Each card shows requester, what they're requesting (env upgrade, additional cost, exception), context numbers, two buttons: `Approve` (success) and `Reject` (danger, opens modal asking for reason).

Plus a tab "History" listing past decisions with audit trail.

### 7.12 Admin

A standard CRUD admin with side nav (Section 5.3 — Side Nav).

- **Projects** — list + create. Project detail page has tabs: Overview · Microservices · Azure Resources · AWS Resources · Cost rules · Members.
- **Environments** — list of envs across products. Edit env opens a form with node pool config, region, cloud, Prometheus endpoint.
- **Cloud Resources** — Azure / AWS resource catalogue, drag-to-attach to projects.
- **Integrations** — Azure AD, ACS Email, Atlas MongoDB, Prometheus endpoints (test connection button).
- **Users** — table with role chips, last-login, "Disable" button.
- **Audit Log** — paginated table, filter by actor / action / date.

### 7.13 User Infra Panel

Lightweight read-only view for non-DevOps users. Lists their product's envs with status dots, microservice versions, and an "Open ticket" CTA. No cost numbers.

---

## 8. State patterns (must be designed for every page)

### 8.1 Loading
- Skeleton placeholders matching the actual layout (KPI cards, table rows, chart wells).
- Never show a full-page spinner — only inline skeletons.
- Top-right "Updating…" badge (animated dot) when a background refresh is in flight.

### 8.2 Empty
- Compact card with an outline-icon, one-sentence explanation, optional CTA.
- Three flavours: "No data yet" (neutral), "No results match your filter" (with `Clear filters` link), "Not configured" (with `Configure now` CTA for admins).

### 8.3 Error
- Red banner above the affected region. Icon + message + `Retry` button.
- Full-page error (e.g. 500) shows a centred card with diagnostic line + support email.

### 8.4 Stale data
- Amber "Stale data" badge near the page title. Tooltip explains the last good timestamp.

### 8.5 Permission denied
- Lock icon, "You don't have access to this page", contact-admin link.

### 8.6 Form states
- Field error: red border + 11 px helper text below.
- Field warning: amber accent.
- Submit button shows spinner + text "Saving…". On success, toast appears and the dialog closes.

---

## 9. Interaction patterns

- **Hover everywhere** that's clickable. Subtle row tint on tables, brighter border on cards.
- **Focus rings** must be visible. 2 px brand-primary outline offset 2 px from the element.
- **Keyboard support:** Tab order respects visual order. Esc closes any modal / drawer / popover. Cmd/Ctrl-K opens command palette. `/` focuses search.
- **Tooltips:** show on hover after 200 ms, instant on focus. Always include hard data (numbers), never just labels.
- **Click-to-drill:** any chart slice / bar segment / table row that has more detail must have a hover affordance (cursor pointer + subtle tint) and lead somewhere meaningful.
- **Bulk actions:** when a table has checkboxes, a sticky bottom bar appears with the selected count and action buttons.
- **Toasts** never block interaction; they appear top-right and stack.

---

## 10. Responsive design

| Breakpoint | px | Behaviour |
|---|---|---|
| `xs` | < 480 | Single-column. Side navs become bottom sheets. Filter bars become a "Filters" button that opens a bottom drawer. Tables convert to stacked cards (label → value per row). |
| `sm` | 480–767 | Two-column for KPI strip. Charts shrink. Drawers full-screen. |
| `md` | 768–1023 | Three-column. Tables show priority columns only; "+N more" expands a popover. |
| `lg` | 1024–1439 | Full layout, condensed paddings. |
| `xl` | ≥ 1440 | Full layout, generous paddings. Max content width 1440 px centred. |

Hide-on-mobile rules must be **explicit** per page. Never silently truncate data — always offer a way to see the hidden column on tap.

---

## 11. Accessibility (must-haves)

- **Contrast:** AA minimum on every text-on-background pairing. AAA on body text where feasible.
- **Colour is never the only signal.** Status pills always pair colour with an icon or text.
- **All charts** have an underlying data table that is keyboard-reachable via a "View as table" toggle.
- **Form labels** are always present (visually shown or `sr-only` if the field is decorated by an icon-only context).
- **Focus order** is logical. No `tabindex > 0`.
- **Reduced motion** is honoured — disable spinners' rotation, replace with a static label "Loading".
- **Live regions** for refresh-triggered banners (`aria-live="polite"`).
- **Modal trap focus**, Esc closes, focus restored to the trigger.
- **Screen-reader labels** for icon-only buttons via `aria-label`.

---

## 12. Microcopy & tone

- **Voice:** Direct, factual, no marketing-speak. Active voice. No exclamation marks except in destructive confirmations.
- **Currency:** Always USD with a `$` prefix. Sub-cent values to 4 decimals. Anything over $1 000 uses K, over $1 000 000 uses M.
- **Times:** Local browser time, format `12:34:56` for short, `Apr 25, 2026 12:34` for long. Relative ("2 m ago") for activity feeds.
- **Empty state:** "No data yet" — followed by one sentence on how to get data flowing.
- **Destructive confirmations:** "This will delete X. This cannot be undone." Plus a typed-name guard for highly destructive actions.
- **Error messages:** Lead with what failed, not "Oops" or "Something went wrong". Always include a remediation hint.

---

## 13. Iconography reference (Lucide names actually used in the app)

Group these on a single "Icons in use" page in Figma for reference.

`Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Box, Boxes, Calendar, CheckCircle2, ChevronDown, ChevronRight, Clock, Cpu, Database, DollarSign, Filter, FolderKanban, Gauge, HardDrive, History, Info, Layers, LineChart, Lock, Minus, Network, Package, PieChart, Play, RefreshCw, Search, Server, Settings, Share2, Square, ToggleLeft, ToggleRight, TrendingUp, X, Zap`

---

## 14. Data-visualisation principles

1. **Colour map by env, not by chart.** A donut slice for `qa` and a sparkline line for `qa` must be the **same colour**.
2. **Tabular numerals everywhere.** Stack money columns so decimals line up.
3. **No 3-D charts. No pie charts with more than 6 slices.** Use horizontal bar lists instead.
4. **Threshold colour shifts.** Util bars turn `warning` between 80–90 %, `danger` above 90 %.
5. **Hover must reveal exact numbers.** Visual estimate + numeric truth on demand.
6. **Sparklines** prefer area fills at 12 % opacity over heavy stroke fills.
7. **Trend deltas** show absolute and percentage (`+$120 / +4.2 %`). Up-arrow red when cost goes up, green when usage goes up — context matters.

---

## 15. Light & dark themes

Both must ship. Cover every component / page in both modes. The toggle lives in the user avatar dropdown and persists via local storage. Respect `prefers-color-scheme` on first load.

Dark-mode rules:
- Surfaces use cool-blue tints (`#0B1020` canvas, `#111733` panel) — not pure black.
- Reduce shadow opacity by 60 % in dark mode.
- Coloured pills get a soft dark fill at 25 % opacity behind the foreground text.
- Donut slices keep saturation; lines on sparklines brighten by 10 %.

---

## 16. Deliverables expected from Figma AI

1. **Foundations frame** — colour tokens, type ramp, spacing, radii, shadows, motion (light + dark side by side).
2. **Component library** — every atom and molecule from Section 5 as a Figma component with all variants and states.
3. **Patterns frame** — header, side nav, filter bar, table, modal, drawer, toast, command palette.
4. **Pages frame** — every page in Section 7 at desktop (1440), tablet (768), and mobile (390). Each page has separate frames for `default`, `loading`, `empty`, `error`.
5. **Flow prototypes** — connect: Login → Dashboard → Cost Management → drill into product → drill into namespace → expand a category tile.
6. **Tokens Studio JSON export** — handed to engineers to wire into CSS variables.

---

## 17. Anti-patterns (reject these unconditionally)

- Round avatars with no fallback initials.
- Gradient buttons.
- Tabs styled as pills floating on a soft background.
- "Whisper" UI (light grey on white text).
- Decorative icons inside KPI numbers.
- Hero illustrations of people, planets, or rockets.
- Hand-drawn empty-state mascots.
- Lottie animations on dashboards.
- Card shadows heavier than `elev-2`.
- Border radii above 14 px outside the login card.
- More than one font family besides Inter + JetBrains Mono.
- Coloured borders on every panel — colour is reserved for **status, intent, and identity**.

---

## 18. Final instruction to the AI

Generate the entire system above as **one cohesive Figma file** with named pages, components, variants, and modes. Use the tokens **everywhere** (no hard-coded hex on shapes — only token references). Cross-link components so changing the primary brand colour cascades to every button, focus ring, link, and selected state.

Begin by laying out the **Foundations** page, then the **Components** page, then the **Patterns** page, then the **Pages** in the order: Login → App Shell → Dashboard → Cost Management → Cluster Cost → Environment Monitoring → Resource Monitoring → Live Builds → Tickets → Approvals → Admin → User Infra Panel.

Annotate every page with a 280-px caption column on the right explaining the design decisions, role visibility, data sources, and state coverage.

The output should look like the work of a senior product-design team that has shipped two enterprise SaaS apps before — confident, dense, calm, and obviously useful to engineers under pressure at 2 a.m.
