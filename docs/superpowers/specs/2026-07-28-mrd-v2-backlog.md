# Bikri 2.0 — MRD v2 (2026-07-28 session with Karan)

Extends the 2026-07-27 sales-map MRD. Sub-projects 1 (roles) and 2 (default discount) shipped 2026-07-27. This doc captures the expanded backlog, the check lifecycle spec, and the mobile (PWA) direction.

## Backlog

| # | Item | Notes | Depends on |
|---|------|-------|-----------|
| 1 | **Customer locations** | Keep free-text address untouched; add up to **10** Google Places locations per client (`customer_locations` child table: name/address/lat-lng/place_id). SHIPPED 2026-07-28 (17eb7e4). | ~~Google Cloud key~~ done |
| 1b | **Per-order END LOCATION** (Karan, 2026-07-28 — generalizes the Daraz-only idea; renamed from "precise delivery location" same day, terminology below) | ONE geo-pin per order (`customer_locations.order_id`), for Daraz/IG/FB/any channel = where the product finally reached the end customer. **Pre-suggested from the order's address text**; lives in the order-details metadata footer beside VAT/Pro Forma links. Address text stays untouched (couriers + VAT bills). | 1 (done) |

**⚠ ON HOLD (2026-07-28, end of day): location-model merge under reconsideration.** Karan proposes merging order pins into customer locations (one data source for the map) with per-order channel (IG/FB/Daraz) for D2C. Davos's counter: pins live only in customer_locations, orders carry a `location_id` pointer (+ `orders.channel`); preserves order-volume weighting and history. **Blocked on Abhi:** do Bhatbhateni/Trucare specify per-branch quantities at order time, or is it one bulk drop to their distribution hub which they fan out themselves? (Known: all boxes ship to a central distribution location.) Hub answer ⇒ B2B orders point at the hub and branch-level demand is not capturable. Also open: are Daraz orders one aggregate customer or per-buyer rows (affects the 10-cap)? Built-but-UNPUSHED pending this: billing address (field+UI, orthogonal — can ship regardless), end-location picker in create-order step 3, order-pin footer control. SQL run so far: customer_locations base + order-pin RLS patch; billing-address ALTER not yet run.

**Address terminology (canon, 2026-07-28):**
1. **Address** (customer, free text) — where WE hand off; courier slip; may be "Daraz Hub". Untouched forever.
2. **Billing address** (customer, text — backlog 5b) — registered/invoice address for VAT bills + pro forma.
3. **Locations** (customer, ≤10 pins) — the client's physical stores/branches. Supply side of the map.
4. **End location** (order, 1 pin) — where the product finally reached the end customer, past any hub handoff. Demand side of the map. NEVER call it "delivery location" — that reads as the drop-off.
| 2 | **Sales dashboard (map + data)** | Port local Leaflet prototype (`Assistant/business/hydralyte/sales-map/`). Also: per-customer mini-map dialog showing all of that customer's pins (requested 2026-07-28; interim = each location row links out to Google Maps). Stack: Leaflet + supercluster/markercluster + leaflet.heat — handles far more points than we have. Real risks: PostgREST 1000-row cap (paginate) and React re-render churn (memoize layer, render markers outside React cycle). MapLibre GL only if we ever outgrow Leaflet. | 1 |
| 3 | **My Clients page** | Sales rep claims a client they onboarded → **admin approval** → sits under rep's My Clients with health indicators (sales slowing, no order in X days). Client-level rep attribution; pairs with leads/commission (hyd-065). | — |
| 4 | **Check lifecycle module** | See spec below. Superseded "photo on payment" idea. Includes offline upload queue for photos taken without signal. | — |
| 5 | **Pro forma invoice tweaks** | Parked — Karan will supply details when this comes up. | Karan |
| 5b | **Address model split** (Karan, 2026-07-28) | Three kinds: **billing address** (NEW text field — what invoices/pro forma print; pairs with PAN/VAT), **shipping/delivery address** (= existing free-text field, relabel only), **multi-store locations** (= shipped geo-pins feature, nothing to do). Decide invoice-template source when building; natural to bundle with #5. | — |
| 6 | **Order-flow fix: picker shows address** | New-order client picker currently shows only name + phone; add address line to differentiate. | — |
| 7 | **Order-flow fix: create-from-search** | Phone-number search with zero results → show "Create this customer" button, pre-filled with the typed number. | — |
| 8 | **Order-flow fix: selector/new-form overlap** | While the add-new-customer form is open, hide the existing-customer selector (currently both visible). | — |
| 9 | **Push notifications** | Web Push via edge function + `web-push`, `push_subscriptions` table. iOS: works since 16.4 but ONLY after home-screen install; both reps are on iOS. First use case: "new task assigned" / approval-queue badge. | PWA install |
| 10 | **In-app task lists** | `tasks` table (title, details, assignee, status, due date); per-user list + admin assign/view-all. **Replaces the team-facing Notion "Hydralyte task" board** for sales/ops. Build-time decision: migrate open Notion tasks or drain naturally. | — |
| — | **Mobile PWA pass** | Manifest + service worker; sales-role pages built mobile-first (tables→cards, sidebar→bottom tabs). Home page is **action-first**, not a dashboard (see below). | 3, 4, 10 |

Deferred (unchanged from MRD v1): OSM/POI gap layer — Nepal POI data unreliable; prospect universe is vetted manually.

## Check lifecycle spec (v0)

```
CAPTURED ──► RECEIVED ──► DEPOSITED ──► PAID
```

1. **Captured** — rep photographs check on receipt; submits client, amount, date received, date on check. Enters review queue.
2. **Received** — Abhi (accounts) compares fields vs photo, corrects or approves. Pending deposit.
3. **Deposited** — Bikash deposits, photographs bank voucher (photo 2 on same record), marks deposited.
4. **Paid** — Abhi confirms → payment posts to customer ledger.

Evidence trail per check: 2 photos (check + deposit voucher), actor + timestamp per transition, corrections vs submitted values.

**Open decision (Karan, at build time):** balance reduces at **Received** or **Paid**? Recommendation: **Paid only** (checks bounce; commission "vests on credit clearance" should mean cleared money). Mitigate reporting lag by showing "NPR X in pending checks" beside the balance.

Photos: Supabase Storage bucket, private, RLS by role.

## Mobile direction (decided this session)

- **PWA, not native.** One codebase; role gating (shipped) decides *what* shows, Tailwind responsive decides *how*. Heavy admin tables may stay desktop-only.
- Both reps on **iOS**: Web Push requires home-screen install (one-time ritual). If push proves flaky in practice → wrap same code in **Capacitor**, distribute via **Apple unlisted App Store link** ($99/yr account). **TestFlight rejected as permanent channel** (90-day build expiry) — stopgap only.
- Connectivity: online required for writes (same as desktop); service worker gives instant shell + cached viewing offline + **queued photo uploads** when signal drops. NO full offline-first order creation (complexity not warranted).
- **Home = action launcher, role-scoped:** New client/lead · Check received (camera-first) · Check deposited · My approvals (badge = push use case) · My Clients · My tasks.

## Suggested sequencing

1. Order-flow fixes (6–8) — small, no decisions needed
2. Locations (1) — gated on Google Cloud key
3. Sales dashboard/map (2)
4. My Clients (3) + task lists (10)
5. Check lifecycle (4)
6. Mobile PWA pass + push (9)
