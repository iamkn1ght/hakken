# Hakken — Discovery Rail · RECAP

> Per-rail sprint state, deployment state, test counts, blockers. Master cross-rail tracker lives at `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`.

**Rail:** Hakken (#5 of 6 KMV platform rails)
**Status:** 🟢 HK-1 CLOSED 19/19 pts · MVP Gate 1 met (pending Chamia + Silvia sign-off) · live on Railway + Supabase · HK-2 next
**Repo:** [`iamkn1ght/hakken`](https://github.com/iamkn1ght/hakken) · local: `c:\Projects\hakken\`
**Supabase project:** `sgmzfskxwgtjolfppdae` (eu-west-1, Postgres 17.6) — provisioned 26 May 2026
**Railway project:** `eb482388-fc19-456d-8fa6-e6563781fa5e` (service `cb7047f7-aff8-45a8-bb09-f1551c5a81b5`)
**Domain:** `hakken.co.ke` (TBD)
**Audit chain lock key:** `73210789` (rail-unique; see [src/lib/auditWriter.ts](src/lib/auditWriter.ts))

---

## Sprint state

| Sprint | Goal | Status | Notes |
|---|---|---|---|
| **HK-1** | Foundation: schema migration v1, app/vertical registration, regulatory containment CI gate | 🟢 CLOSED 19/19 · MVP Gate 1 | Live; pending Chamia+Silvia gate sign-off |
| HK-2 | Entity API + geo-indexing + observability baseline | ⚪ Pending HK-1 close | |
| HK-3 | Broadcast API + indexer + structured logging | ⚪ Pending HK-2 + KP-15 SC-1 sign-off | |
| HK-4 | Ranking engine v0 + Redis hot-path cache | ⚪ Pending HK-3 | |
| HK-5 | Identiti + Kipkiren Pay integration | ⚪ Pending HK-4 + ID-14 Phase 2 | **Stage 1 sandbox target** |
| HK-6 | Lunch Drop plugin + tier economy start | ⚪ Pending HK-5 + Helpan H-12 | |
| HK-7 | Klokd plugin + Todoku emission + tier economy complete | ⚪ Pending HK-6 + SC-2 sign-off | |
| HK-8 | Pilot integration prep (Klokd leads) | ⚪ | |
| HK-9 | Pilot stabilisation (Lunch Drop joins) | ⚪ | |
| HK-10 | Pilot exit + MVP gate | ⚪ | **Stage 3 GA target** |

Authoritative sprint backlog: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Hakken-Discovery rail-DevPack\hakken-build-pack-v1.0.md` §4.

---

## HK-1 Foundation — DoD checklist

H-items: H1, H2, H13. Sprint budget 19 pts. **MVP Gate 1**.

### H1-001 — schema migration v1: core tables (5 pts) ✅ CLOSED
- [x] `src/db/migrations/0001_core_tables.sql` authored
- [x] All 10 core tables present (apps, verticals, entities, broadcasts, tiers, entity_tiers, plugins, ranking_calls, analytics_events, cached_signals)
- [x] PostGIS extension; `geography(POINT, 4326)` on entities + broadcasts + ranking_calls
- [x] All FK constraints, indexes, CHECK constraints per Spec §3.2
- [x] Down-migration written (`0001_core_tables_down.sql`)
- [x] **Applied to eu-west-1 Supabase (`sgmzfskxwgtjolfppdae`) — 26 May 2026; PostGIS installed, all 10 tables present (verified by [scripts/verifyHk1.ts](scripts/verifyHk1.ts))**

### H1-002 — schema migration v1: audit schema (3 pts) ✅ CLOSED
- [x] `src/db/migrations/0002_audit_schema.sql` authored + applied
- [x] `hakken_audit` schema created, separate from `public`
- [x] Append-only enforcement: RLS + `FORCE ROW LEVEL SECURITY` + REVOKE UPDATE/DELETE + defence-in-depth trigger
- [x] §A.11 cross-rail audit fields present (traceparent, business_op_id, target_rail, target_operation)
- [x] Genesis row seeded with SHA-256(`hakken-genesis`); hash_version=1 (verified against expected hash on the live DB)
- [x] Spec §3.3 sub-tables exposed as VIEWs on the canonical chain (rationale documented in migration header)
- [x] Lock key `73210789` registered (CI gate at `.github/workflows/ci.yml`)
- [x] **UPDATE-reject confirmed end-to-end on live Supabase**: `UPDATE hakken_audit.audit_log` returns the trigger's `append-only — UPDATE rejected` error (verifyHk1.ts).

### H2-001 — app registration endpoint (3 pts) ✅ CLOSED
- [x] `POST /v1/apps` ([src/modules/apps/](src/modules/apps/)) writes app_slug, app_name, vertical, sided, rate_limit_rpm, status, server-generated hmac_secret (returned once)
- [x] Admin-scoped token guard ([src/plugins/adminAuth.ts](src/plugins/adminAuth.ts), onRequest, constant-time compare, fail-closed); unauthenticated → 401
- [x] Duplicate app_slug → 409 `APP_SLUG_CONFLICT` (structured envelope)
- [x] Registration emits a hash-chained audit entry (`admin.app.register`)
- [x] `GET /v1/apps/:app_id` (admin; hmac_secret never re-surfaced)
- [x] Down-migration: apps row removed by 0001 down-migration

### H2-002 — vertical registration endpoint (3 pts) ✅ CLOSED
- [x] `POST /v1/verticals` ([src/modules/verticals/](src/modules/verticals/)) registers + links to an app
- [x] Migration 0003 adds `app_id`, `plugin_config`, `schema_version`, `status` to verticals (AC#3)
- [x] Unregistered app → 404 `VERTICAL_APP_NOT_FOUND` (AC#4)
- [x] `klokd` (two_sided) + `lunch_drop` (one_sided) bootstrapped via [scripts/seedBootstrap.ts](scripts/seedBootstrap.ts) against live Supabase (AC#2)
- [x] Vertical isolation verified at the data layer: each vertical links only to its own app (AC#5); full cross-query isolation lands at HK-2 with entity queries
- [x] Registration emits a hash-chained audit entry (`admin.vertical.register`)

### H13-001 — regulatory containment CI integration (5 pts)
- [x] `src/lib/regulatoryContainment.ts` — recursive scanner with §10.7 + AC#4 banned-key list
- [x] `src/lib/regulatoryContainment.test.ts` — covers all 6 AC#4-mandated keys + nested + allowlist exceptions
- [x] `src/plugins/regulatoryContainmentPlugin.ts` — Fastify preHandler + boot-time refuse-to-register guard
- [x] `RegulatoryContainmentError` (422 / code `REGULATORY_CONTAINMENT_VIOLATION`) wired through errorMapper
- [x] `.github/workflows/ci.yml` — PR gate (test:containment) + key-inventory grep gate + audit-lock-key invariant gate

---

## Cross-rail joints inherited (consuming-side already shipped)

| Joint | Consuming side status | Hakken side status |
|---|---|---|
| KP-15 analytical surface (`/analytics/v1/*`) | ✅ SC-1 scaffold 21 May | ⚪ HK-3 (Stripe-style HMAC + bands-not-numbers) |
| TD-14 `hakken.*` event ingest | ✅ Shipped 21 May (143/143 tests) | ⚪ HK-7 (8 hakken.* event types via Todoku /v1/events/ingest) |
| ID-14 cross-app consent Phase 1 | ✅ Shipped 22 May | ⚪ HK-3 (consent reads + 60s TTL cache) |
| ID-14 Phase 2 (SCOPE_DEGRADED webhook) | 🟡 Open | ⚪ HK-4 (Kafka consent.events consumer; stub if not landed) |
| Helpan H-9 / H-10 / H-12 per-app matchers | ✅ All closed 21 May | ⚪ HK-6 (Helpan agents call POST /v1/ranking/query as consumers) |

---

## Deployment

- **Local dev:** `pnpm install && pnpm run dev` (requires `.env` from `.env.example`).
- **Supabase project:** ✅ `sgmzfskxwgtjolfppdae` (eu-west-1, Postgres 17.6). Migrations 0001 + 0002 applied 26 May 2026.
- **Railway service:** ✅ Live at https://hakken-production.up.railway.app. Project `eb482388-fc19-456d-8fa6-e6563781fa5e`, service `cb7047f7-aff8-45a8-bb09-f1551c5a81b5`, env `448a45ac-ae2e-4dbd-baf3-68a4be237c66`. Deploy successful 28 May 2026.
  - `GET /v1/health` → 200 `{"ok":true,"status":"healthy","version":"0.1.0-hk1"}`
  - `GET /v1/health/deep` → 200 `database: healthy`, `audit_log: healthy` (live Supabase round-trip + genesis row read), all other components `unavailable` (expected until HK-3+).
- **GitHub repo:** ✅ [`iamkn1ght/hakken`](https://github.com/iamkn1ght/hakken). Initial HK-1 commit `0636e67` pushed to `main` (26 May 2026).

---

## Test counts

| Suite | Files | Tests | Status |
|---|---|---|---|
| Unit (`src/**/*.test.ts`) | 3 | **60 / 60** ✅ | auditWriter (16) + regulatoryContainment (36) + errors (8) |
| Route inject (`test/hk1Routes.test.ts`) | 1 | **10 / 10** ✅ | health, admin 401s, validation 400, containment 422 (no DB) |
| **Total** | **4** | **70 / 70** ✅ | |
| Live verify (`scripts/verifyHk1.ts`) | — | 30 checks | schema + H2 bootstrap + audit-chain recompute (5 rows) on live Supabase |

Typecheck: ✅ clean (`pnpm run typecheck`).

Mirroring rail-wide convention: Identiti closed at 233/233, KP at 416/416, Todoku at 250/250, Helpan AI at 294/294. Hakken HK-1 close at 70/70 unit/route + a live verify gate. Repo round-trip integration tests (gated on a future `TEST_DATABASE_URL`) land at HK-2 — there is no throwaway test DB yet and the audit chain is append-only, so HK-1 proves the DB path via the real klokd/lunch_drop bootstrap + verify probe rather than disposable test rows.

---

## Blockers

| ID | Description | Owner | Required by | Status |
|---|---|---|---|---|
| HK-1-B1 | Supabase project provisioned in eu-west-1 under KMV org | Chamia | First migration run | ✅ 26 May 2026 |
| HK-1-B2 | Railway service provisioned | Chamia | First deploy | ✅ 26 May 2026 |
| HK-1-B3 | GitHub repo created at `iamkn1ght/hakken` | Chamia | First push | ✅ 26 May 2026 |
| HK-1-B4 | `.env` populated with `DATABASE_URL`, KP/Identiti/Todoku/Kafka secrets | Chamia + Silvia | First boot | 🟡 `DATABASE_URL` set; KP/Identiti/Todoku/Kafka secrets pending |
| HK-1-B5 | `ADMIN_API_TOKEN` set on Railway + redeploy (so POST /v1/apps + /v1/verticals work in prod) | Chamia | HK-1 prod admin ops | 🟡 **action needed** — see note below |
| HK-3-B1 | KP-15 v1.1 materialised views | KP Eng (Chamia escalation) | HK-3 lock (SC-1) | 🟡 open |
| HK-4-B1 | Managed Kafka broker (Confluent Cloud or Upstash) | Chamia + Track A | HK-4 | 🟡 open |
| HK-4-B2 | ID-14 Phase 2 (`SCOPE_DEGRADED` webhook) | Identiti Eng | HK-4 (stub OK) | 🟡 open |

---

## Open Decisions (Build Pack §8)

| # | Decision | Status | Notes |
|---|---|---|---|
| OD-7 | Plugin sandbox impl | 🟡 Open · Silvia | `isolated-vm`, `node:vm`, or containerised. Required before HK-6 lock. |
| OD-8 | Redis provider | 🟡 Open · Silvia | Upstash or Railway-managed. Required before HK-4 lock. |
| OD-9 | Klokd pilot dev resource | 🟡 Open · Ivy Wanja | Confirm by end of HK-6. |
| OD-10 | Lunch Drop pilot dev resource | 🟡 Open · LD PM | Confirm by end of HK-7. |
| OD-11 | DPA 2019 counsel engagement | 🟡 Open · Chamia | Engage no later than HK-5. |

---

## Provenance

- HK-1 foundation scaffold authored 26 May 2026 from `INSTRUCTION_PACK.md` + `hakken-build-pack-v1.0.md` + `hakken-rail-spec-md.md`.
- Closest analogue: `C:\Projects\helpan-ai-rail\` (read-heavy + Kafka emission + per-app safety policies + audit-chain hardening).
- Spec §13.1 "Express 5" is superseded by Reboot Pack v1.3 §13 stack lock (Fastify 4).
- INSTRUCTION_PACK.md §6.4 table list is superseded by Build Pack §3.2 / H1-001 (10 core tables — same list Reboot Pack consuming-side joints assume).
