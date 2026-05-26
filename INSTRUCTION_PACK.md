# Hakken — Discovery Rail · Build Instruction Pack

**Document type:** Self-contained build instruction pack for a fresh Claude session.
**Date:** 26 May 2026.
**Authority:** Platform Rails Reboot Pack v1.3 (23 May 2026) §10 + Hakken Build Pack v1.0 + joint contracts already shipped on the consuming rails.
**Owner:** Chamia Mutuku (CEO & CPO), Kirimon Market Ventures · CTO: Silvia Mumbua.
**Target repo:** `C:\Projects\hakken\` (this folder).
**Status:** 🟡 Design phase complete · Build pending sign-off · Cross-rail consuming-side joints all CLOSED.

---

## 0. Read this first — Hakken in one paragraph

Hakken is the **discovery rail** of the KMV six-rail platform — geo-indexed entity registry, broadcast queries, ranking engine, tier-economy signals, and cross-app discovery feeds. It is one of two NEW rails introduced in Reboot Pack v1.3 (Hakken + Itafika). Three other consuming-side joints have already shipped from Hakken's eventual consumers: Kipkiren Pay's analytical surface (`KP-15`, SC-1 scaffold), Todoku's `hakken.*` event ingest contract (`TD-14`), and Identiti's cross-app consent surface Phase 1 (`ID-14`). Hakken-the-rail itself is unbuilt.

The job of this instruction pack: tell a fresh Claude session everything needed to begin Sprint HK-1 (Foundation) and proceed through HK-10 (Pilot Exit and MVP Gate) without re-reading the whole platform corpus.

---

## 1. Platform context — the six-rail topology

The KMV platform is six rails plus one external payments platform plus N consuming apps. Hakken is rail #5.

| # | Rail | Status (26 May 2026) | Folder |
|---|---|---|---|
| 1 | Identiti | 🟢 14/17 sprints closed · 233/233 tests · Stage 1 sandbox reached | `C:\Projects\identiti\` |
| 2 | Kipkiren Pay | 🟢 18/20 closed · 416/416 tests · Stage 1 sandbox reached · live Daraja sandbox | `C:\Projects\kipkiren-pay\` |
| 3 | Todoku | 🟢 LIVE on Railway · 250/250 tests · 6 prod-readiness env flips ready | `C:\Projects\todoku-prod\` |
| 4 | Helpan AI | 🟢 17 sprints closed · 294/294 tests · all per-app sprints done · 24 endpoints | `C:\Projects\helpan-ai-rail\` |
| **5** | **Hakken** | 🟡 **Design phase complete · build pending (THIS FOLDER)** | `C:\Projects\hakken\` |
| 6 | Itafika | 🟡 Sprint-0 reboot pack v1.1 approved · build pending | _not yet provisioned_ |

Plus: `@kmv/platform-shared` package at `C:\Projects\platform-shared\` (vendor it; don't path-dep — see §5).

Plus: **LipaStack** (NOT a rail; external PCI-DSS L1 payment platform). Not relevant to Hakken-the-rail itself, but Hakken-the-discovery-rail can index LipaStack-merchant entities post-Hakken-MVP if needed.

---

## 2. What Hakken is (and is not)

### Hakken IS
- A **cross-app discovery rail**: a single place every consuming app emits "fresh arrivals / new listings / shift openings / inventory snapshots" events to, and a single query surface that returns ranked, consent-filtered, geo-aware discovery results.
- **Broadcast-query** oriented: apps publish; apps subscribe to discovery queries; ranking is centralised; consent is enforced via Identiti.
- A **tier-economy carrier**: merchants/Mamas/Klokd workers earn tier signals via Hakken (visibility tier = signal of platform reputation; analytical surface via KP-15 feeds the scoring).
- **Per-rail audit-chained** (own `pg_advisory_xact_lock` key — see §6).

### Hakken is NOT
- A general-purpose search engine. It indexes only entities emitted by consuming apps in the KMV portfolio. No web crawling.
- A recommendation ML platform at MVP. Ranking v0 (HK-4) is rule-based + tier-weighted scoring; ML/embedding layer is post-MVP.
- A user-facing app. Hakken has no consumer surface. It has consuming-app surfaces and an internal operator portal.

---

## 3. Canonical docs to read in order

All paths are relative to `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\` (the docs root, NOT a git repo — edits save to disk, no commit).

**Phase 0 — orient (read once at session start, ~30 min):**
1. `may23rd/Platform Rails Integration and reboot/Platform_Rails_Reboot_Pack_v1_3.md` §10 (Hakken locked decisions) — the canonical rail-thesis.
2. `may23rd/Platform Rails Integration and reboot/App_Integration_Guide_v1_1.md` (Hakken integration patterns).
3. `RECAP.md` §0 + §1.3 + §3 (six-rail at-a-glance + dependency graph + current build state).

**Phase 1 — Hakken specifics (read in detail before HK-1 starts):**
4. `newdocs/Hakken-Discovery rail-DevPack/hakken-rail-spec-md.md` — the **wire-level contract**.
5. `newdocs/Hakken-Discovery rail-DevPack/hakken-build-pack-v1.0.md` — DoDs, MVP gates, full HK-1..HK-10 sprint backlog (this pack supersedes anything you read in the spec — it's where Sprint 1 lives).
6. `newdocs/Hakken-Discovery rail-DevPack/hakken-reboot-pack-md.md` — Hakken-internal reboot pack.

**Phase 2 — joint contracts (must understand exactly what's shipped on the consuming side):**
7. `newdocs/Hakken-Discovery rail-DevPack/hakken-kpay-analytical-surface-md.md` — the **KP-15 joint contract** (Hakken consumes 7 read-only endpoints `/analytics/v1/*`; bands-not-numbers; n-threshold floor; symmetric-containment CI gate). KP-15 SC-1 scaffold shipped 21 May 2026; v1.1 materialised views deferred.
8. `newdocs/Hakken-Discovery rail-DevPack/hakken-todoku-event-schema-md.md` — the **TD-14 joint contract** (Hakken-internal tenant emits 8 `hakken.*` event types via Todoku `POST /v1/events/ingest`; AJV envelope validation; PII regex backstop; insert-or-de-dup on event_id).

**Phase 3 — platform-wide standards (skim if unsure):**
9. `Claude_Code_Instruction_Pack_Platform_Rails_v1_0.md` + Amendment §A — the universal build brief (stack lock §79; schema standards; endpoint order; `drizzle migration files — not raw SQL scripts` §1266).
10. `Identiti_Rail_Contract_v1.0_Scaffold.md` §A — `actor` + `initiated_by` claim spec (Hakken must propagate on every query and every event emit per §A.2).

**Phase 4 — when in doubt:**
- Other rails' codebases serve as canonical examples: `C:\Projects\helpan-ai-rail\` is the most recent rail and the closest analogue to Hakken (read-heavy with Kafka emission + per-app safety policies).

---

## 4. Cross-rail joints already shipped on consuming-side (what Hakken inherits)

Hakken's eventual consumers have already done their part of the joint contracts. **Do not re-design these.** Hakken implements its side of each:

| Joint | Shipped | Hakken side |
|---|---|---|
| **KP-15 analytical surface** | ✅ SC-1 scaffold (21 May 2026; v1.1 mat-views deferred) | Hakken queries `https://api.pay.kipkiren.co.ke/analytics/v1/*` at HK-3 and HK-4 to feed the ranking engine. Stripe-style HMAC; bands not numbers; respect symmetric-containment. |
| **TD-14 event ingest** | ✅ 21 May 2026 (commits `906eedc` + `56ec225`; 143/143 tests) | Hakken emits 8 `hakken.*` event types via `POST https://todoku-prod-production.up.railway.app/v1/events/ingest` from the `hakken_internal` Todoku tenant. AJV envelope; idempotent on event_id; downstream phone-token-mint dispatch deferred until Identiti's mint endpoint is reachable. |
| **ID-14 Phase 1 consent surface** | ✅ Phase 1 closed (22 May 2026) | Hakken queries `https://identiti.co.ke/v1/consent/:account_uuid` to filter discovery results. Phase 2 (`SCOPE_DEGRADED` webhook + scope-hierarchy) is OUTSIDE Hakken's gate but it informs HK-4 cache-invalidation. |
| **H-8c agent admission** | ✅ `helpan-kws-v1` admitted 21 May (out of Hakken scope; included here for completeness — Helpan-side agents that consume Hakken queries via delegated authority arrive in HK-6+) | — |

---

## 5. Stack lock (NON-NEGOTIABLE per Reboot Pack v1.3 §13 + Instruction Pack §79)

Mirror exactly what the other four rails do. Do not deviate.

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 22 LTS | — |
| Language | TypeScript 5.x strict | `"strict": true` non-negotiable |
| Web framework | Fastify 4.x | NOT Express. NOT Hono. NOT Koa. |
| Schema validation | AJV (JSON Schema 2020-12) | `coerceTypes: false` rail-wide pin from TD-0 |
| Database | PostgreSQL 16 via Supabase **eu-west-1** | NOT af-south-1, NOT eu-north-1, NOT any other region — see [[project_supabase_region]] |
| ORM | Drizzle ORM | Migrations as drizzle-kit files; hand-edit generated SQL for CHECK constraints / partial indexes / append-only triggers / hash-chain seed rows (per Instruction Pack §1266) |
| DB driver | postgres-js | `prepare: false` rail-wide pin from Todoku TD-0 — required for Supabase pgbouncer compatibility |
| Event bus | kafkajs | Managed Kafka (Confluent Cloud / Upstash) — Track A external dep |
| Tests | Vitest | mirror Helpan AI: real-Postgres tests + always-on unit tests |
| Deploy | Railway | own service · own Railway project |
| Workspace | pnpm workspaces + Turborepo | — |
| Shared package | `@kmv/platform-shared` | **Vendor it** (`vendor/platform-shared/`); don't path-dep — per Identiti 15 May / Todoku 18 May / Helpan AI 18 May precedent |

---

## 6. Hakken-specific decisions (locked)

### 6.1 Audit-log hash chain lock key
Each rail uses a unique constant `pg_advisory_xact_lock` key inside the entry-append transaction:
- Identiti: `73210123`
- Kipkiren Pay: `73210456`
- Helpan AI: `7268010825743210`
- **Hakken: `73210789`** ← use this key

Pattern: see `C:\Projects\helpan-ai-rail\src\lib\auditLogger.ts` or `C:\Projects\identiti\src\lib\auditLogger.ts` for the canonical implementation. Key-order-stable canonical JSON; entry-append wrapped in advisory lock; hash links every row.

### 6.2 Supabase project
Provision a new Supabase project for Hakken in **eu-west-1**. Suggested ref scheme (operator action — Chamia to confirm): `hakkenXXXXXX` matching the Helpan pattern `jvkhoveeayixbjnhmqxa`. The org issue applies: KP's project sits in a different Supabase org than Kirimon Market Ventures — confirm Hakken provisions under the same org as Identiti/Todoku/Helpan to avoid MCP-side ops needing a project transfer.

### 6.3 Domain
`hakken.co.ke` is reserved per Reboot Pack v1.3 §10. Internal service URLs:
- Production: `https://hakken.co.ke` (TBD when Stage 2)
- Railway dev: `https://hakken-production.up.railway.app` (or similar — match Todoku naming)

### 6.4 Database schema
Minimum tables at HK-1 (Foundation, migrations 0001–0003):
- `entities` — geo-indexed entity registry (PostGIS extension required); columns: `id`, `account_uuid` (FK to Identiti), `entity_type` (CHECK constraint), `lat`, `lng`, `geo` (PostGIS `geography(POINT)`), `name`, `created_at`, `updated_at`, `deleted_at`.
- `zones` — administrative zones (Westlands, Kilimani, etc).
- `tier_signals` — per-entity tier scores (from KP-15 + reputation events).
- `consent_filters` — cached `identiti.consent.events` state (TTL 60s; refresh via Kafka consumer).
- `audit_log` — hash-chained, ts-ordered, append-only (use the migration-0007-from-Helpan pattern + 73210789 key).
- `app_credentials` — HMAC keys for consuming apps (`hakken_internal` for the rail's own Todoku tenant emit; consumer apps later).

RLS + `FORCE ROW LEVEL SECURITY` on every customer-tenant table (`entities`, `tier_signals`, `consent_filters`). SELECT-only RLS is insufficient — without `FORCE`, the table-owner connection silently bypasses every policy. See Helpan migration 0007 for the canonical example.

### 6.5 Discovery event schema
8 `hakken.*` event types emitted via Todoku TD-14 (consume the existing schema — do not re-author it):
- `hakken.entity.created`
- `hakken.entity.updated`
- `hakken.entity.deactivated`
- `hakken.fresh_arrivals` (the family-discovery flagship matcher trigger)
- `hakken.basket_auto_refill` (same)
- `hakken.shift_opening` (Klokd consumer trigger)
- `hakken.tier_changed`
- `hakken.consent_scope_changed`

(Confirm exact list against `hakken-todoku-event-schema-md.md` before HK-2 — this is from memory of the joint contract.)

### 6.6 Cross-rail invariants Hakken MUST satisfy
- **§A.2** — every Hakken query and every event-emit carries `actor` + `initiated_by` claims on the JWT/HMAC envelope.
- **§A.11** — every audit row carries `traceparent` (W3C) + `business_op_id` (idempotent grouping key — e.g. `discovery_query_id`, `entity_id`).
- **`initiated_by` field convention** — platform-wide per Reboot Pack v1.3 §13.5. Propagated through every rail call.

### 6.7 Stage gates
- **Stage 0:** scaffolding (HK-1 foundation).
- **Stage 1 sandbox:** end of HK-5 (Identiti + KP integration live in dev mode).
- **Stage 2 closed beta:** HK-8 + pen-test resolution.
- **Stage 3 GA / MVP:** HK-10 — pilot exit gate review.

---

## 7. Sprint plan — HK-1..HK-10

Authoritative source: `newdocs/Hakken-Discovery rail-DevPack/hakken-build-pack-v1.0.md` §4 Sprint Backlog. Summary below — re-read the build pack before each sprint kickoff.

| Sprint | Goal | Weeks | Key deps |
|---|---|---|---|
| **HK-1** | Foundation: Fastify scaffold · `@kmv/platform-shared` vendored · mTLS+HMAC auth middleware · idempotency middleware · `GET /v1/health` · migrations 0001–0003 (universal + entities + zones + tier_signals + consent_filters + audit_log + app_credentials) · hash-chained audit log with lock key `73210789` · PostGIS extension enabled | 2 | None |
| **HK-2** | Entity API: `POST /v1/entities` + `GET /v1/entities/{id}` + `PATCH` + `DELETE` (soft-delete with `deleted_at`) · RLS write policies + `FORCE` per Helpan migration-0007 pattern · query endpoints (filter + cursor-paginated) · entity-type enum CHECK constraint | 2 | HK-1 |
| **HK-3** | Broadcast API: app-side discovery query surface `POST /v1/discovery/queries` · KP-15 analytical-surface consumer wired (Stripe-style HMAC + bands-not-numbers respect) · ID-14 consent-filter cache (60s TTL) · cache+invalidate via Identiti consent events | 2 | KP-15 ✓, ID-14 Phase 1 ✓ |
| **HK-4** | Ranking Engine v0: signal aggregation · tier-weighted scoring · consent-aware filtering · Kafka consumer for `identiti.consent.events` (`SCOPE_DEGRADED` — depends on ID-14 Phase 2) · ranking explainability (per-dimension contribution surfaces to operator console) | 2 | HK-3, ID-14 Phase 2 (or stub) |
| **HK-5** | Identiti + Kipkiren Pay integration: full RS256 JWT verification chain · KP-15 analytics consumer live against KP staging · cross-rail e2e fixtures · staging Supabase project promoted from dev | 2 | Identiti staging JWKS reachable, KP-15 live |
| **HK-6** | Lunch Drop plugin + Tier Economy start: Lunch Drop is the first consumer (was kaLunch v2 — renamed; see [[lunchdrop-instruction-pack]]) · tier promotion signals (Mama tier from order-volume + rating + reliability) · Helpan AI `family-discovery` matcher (H-12 closed) joints on `hakken.fresh_arrivals` | 2 | HK-5, Helpan H-12 ✓, Lunch Drop rail integration |
| **HK-7** | Klokd plugin + Todoku emission + Tier Economy complete: emit 8 `hakken.*` event types via TD-14 ingest (closed) · shift-discovery surface for Helpan-Klokd matcher (H-9 closed) | 2 | HK-6, Todoku TD-14 ✓ |
| **HK-8** | Pilot Integration Preparation: cross-rail e2e fixtures · rate-limit calibration · ops runbook draft · DR drill · pen-test scoping | 2 | HK-7 |
| **HK-9** | Pilot Stabilisation: smoke fixtures against live cohort · incident playbooks · Stage-2 pen-test resolution (critical + high) | 2 | HK-8, pen-test firm |
| **HK-10** | Pilot Exit and MVP Gate: gate review · HoldCo / rail-consumption sign-off (per Chamia decision memos in `may23rd/chamia-decision-memos/`) | 2 | HK-9, Chamia gate-sign |

Stage 1 sandbox target: end of HK-5 (~10 weeks from HK-1 start, assuming HK-3 doesn't slip on KP-15 v1.1 mat-views).
Stage 3 MVP target: end of HK-10 (~20 weeks).

---

## 8. Hard rules — non-negotiable

1. **Code as files, never chat blocks.** Every code artefact lands on disk via the Write/Edit tools. Never produce code inside a markdown fence in conversation.
2. **Documents delivered as `.md` AND `.pdf`** when external (reboot packs, contracts, advisories). Internal devnotes can be `.md` only.
3. **KES minor units only** — no floating point monetary values anywhere. Hakken doesn't handle money directly, but it consumes KP analytics — respect this.
4. **No `Co-Authored-By: Claude` trailer · no "Generated with Claude Code" footer** — Chamia user instruction 15 May 2026.
5. **Confirm scope before significant changes** per Reboot Pack §16.10. Renaming files, dropping tables, migrating data — confirm with Chamia first.
6. **No `conversation_search` / `recent_chats` during active build sessions** — per Chapaa standing rules §9; Hakken inherits this.
7. **English-first default; Swahili via toggle** — for any operator-facing UI text.
8. **No raw MSISDNs in Hakken DB** — phone tokens via Identiti (audience: hakken_internal if Hakken needs to send notifications via Todoku). Hakken should not need MSISDNs at all in v1.
9. **No KYC documents in Hakken DB** — Identiti owns those; Hakken reads tier signals only.
10. **Drizzle migrations only** — no raw SQL files except hand-edited drizzle-kit-generated SQL for PostGIS / CHECK / partial indexes / triggers. Per Instruction Pack §1266.

---

## 9. Pre-flight checklist — before HK-1 starts

Chamia or the operator must provide / confirm before kickoff:

- [ ] Supabase project provisioned in **eu-west-1** under the Kirimon Market Ventures org (NOT a separate org — see KP's history of needing project-transfer).
- [ ] Railway service provisioned (`hakken-production` or similar).
- [ ] GitHub repo created — `whyyam1/hakken` (matches KP pattern `whyyam1/kipkiren_pay`) or `iamkn1ght/hakken` (matches Todoku pattern). Confirm with Chamia.
- [ ] `.env` template populated with: `DATABASE_URL`, `KP_API_BASE`, `KP_API_HMAC_SECRET`, `IDENTITI_API_BASE`, `IDENTITI_JWKS_URL`, `TODOKU_API_BASE`, `TODOKU_HMAC_SECRET` (`hakken_internal` tenant), `KAFKA_BROKERS`, `LOG_LEVEL`, `NODE_ENV`.
- [ ] `@kmv/platform-shared` vendored into `vendor/platform-shared/` at HK-1 start — copy from `C:\Projects\platform-shared\` and lock to the version Identiti/Todoku/Helpan AI vendored. See Helpan AI 18 May vendoring as the most recent reference.
- [ ] Sprint plan re-confirmed against `hakken-build-pack-v1.0.md` §4 in case anything has been revised since this pack was authored (26 May 2026).
- [ ] Audit-log lock key `73210789` registered in this pack — do not pick a different key.
- [ ] Kafka topic naming convention agreed: `hakken.entity.events`, `hakken.discovery.events`, `hakken.tier.events` (mirror Helpan AI's `helpan.briefing.events` / `helpan.action.events` naming).
- [ ] Cross-rail wire-up env-vars on consuming side: NOT required for Hakken-the-rail itself (Hakken IS the consumer of KP-15 + ID-14 + TD-14, not the consumed). Consumer-side wire-up (Lunch Drop / Klokd / family-discovery → Hakken) happens at HK-6 + HK-7.

---

## 10. First-steps checklist — once the new Claude session starts

1. Read this entire pack (you're doing it now).
2. Read the canonical docs in §3 in order. Budget ~90 minutes for Phase 0 + Phase 1.
3. Read the most recent rail's source as the closest analogue: `C:\Projects\helpan-ai-rail\` (especially `src/index.ts`, `src/lib/auditLogger.ts`, `src/plugins/`, `drizzle/`).
4. Confirm pre-flight checklist (§9) with Chamia. Block on missing items.
5. Initialise repo: `pnpm init`, Turborepo, Fastify scaffold, vendor `@kmv/platform-shared`, first migration, `/v1/health` endpoint. **This is HK-1 step 1.**
6. **Do not write any business logic in HK-1.** Foundation only — auth middleware, idempotency, health, audit log, schema. The build pack is explicit on this.
7. Mirror the Helpan AI test split: always-on Vitest unit tests + real-Postgres integration tests (separate Vitest config). Aim for 90+% test pass at every sprint close — Identiti closed at 233/233, Helpan at 294/294, KP at 416/416.
8. Update the master `RECAP.md` §1.3 with Hakken status after every closed sprint. The master RECAP lives at `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`.
9. Update the master `Sprint_Backlog_v1_0.html` Hakken table status cells (s-design → s-inflight → s-closed) at sprint boundaries.
10. Maintain a Hakken-local `RECAP.md` here at `C:\Projects\hakken\RECAP.md` (mirror what Identiti/KP/Todoku/Helpan AI keep) — per-rail sprint state, deployment state, test counts, blockers.

---

## 11. Hard blockers — outside session authority

- **Chamia decisions still pending** (see `may23rd/chamia-decision-memos/`): corporate structure (Option B recommended), rail-consumption mode (Option A — full rail-consumption — recommended), Sabakifresh-Itafika sequencing (Option C hybrid — recommended). These don't block Hakken HK-1..HK-5 but inform HK-6+ consumer onboarding.
- **Managed Kafka broker provisioned** (Confluent Cloud / Upstash, Track A §13.5) — needed by HK-3 to consume `identiti.consent.events`. Until provisioned, mock/stub the Kafka layer and proceed.
- **ID-14 Phase 2** (webhook delivery + `SCOPE_DEGRADED` semantics) — not closed at time of writing. Hakken HK-4 needs it for cache invalidation. Stub Phase 2 events at HK-4 if not ready; swap in real consumer when Identiti ships Phase 2.

---

## 12. Reference index

**Other rails as reference implementations:**
- `C:\Projects\identiti\` — newest pattern for KYB + consent surface + step-up
- `C:\Projects\helpan-ai-rail\` — closest analogue (read-heavy + Kafka emit + per-app safety policies + audit-chain hardening)
- `C:\Projects\kipkiren-pay\` — closest analogue for HMAC-signed cross-rail HTTP clients
- `C:\Projects\todoku-prod\` — most mature deployment (Railway-live with full prod-readiness scaffolding)
- `C:\Projects\platform-shared\` — the shared package to vendor

**Canonical docs root:** `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\` (NOT a git repo — direct edits OK)

**Master cross-rail tracker:** `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`

**Master sprint backlog:** `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\Sprint_Backlog_v1_0.html`

**Decision memos:** `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\may23rd\chamia-decision-memos\`

---

*Hakken — Discovery Rail · Build Instruction Pack · 26 May 2026 · Confidential · Authored by Claude for Chamia Mutuku, Kirimon Market Ventures · v1.0 supersedes nothing (initial issue).*
