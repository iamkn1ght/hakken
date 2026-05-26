# Hakken — Discovery Rail

> Cross-app discovery / search / browse / ranking. Rail #5 of the KMV six-rail platform.

**Status:** 🟡 HK-1 Foundation scaffold authored (26 May 2026) · pre-flight pending Chamia sign-off · Cross-rail consuming-side joints all CLOSED

See [`RECAP.md`](./RECAP.md) for sprint state, DoD checklist, blockers, and test counts.

**Domain:** `hakken.co.ke` (TBD)
**Owner:** Kirimon Market Ventures (Kirimon Teknolojia — Silvia)
**Regulator:** DPA 2019

---

## Start here

**Read [`INSTRUCTION_PACK.md`](./INSTRUCTION_PACK.md) first.** It is the self-contained brief for a fresh Claude session — context, canonical-doc pointers, stack lock, sprint plan HK-1..HK-10, pre-flight checklist, and first-steps checklist.

Once you've read the instruction pack, the canonical design corpus lives at:

```
C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Hakken-Discovery rail-DevPack\
  hakken-rail-spec-md.md             ← wire-level contract
  hakken-build-pack-v1.0.md          ← DoDs + MVP gates + HK-1..HK-10 sprint backlog
  hakken-reboot-pack-md.md           ← Hakken-internal reboot pack
  hakken-kpay-analytical-surface-md.md  ← KP-15 joint contract (consuming side)
  hakken-todoku-event-schema-md.md   ← TD-14 joint contract (consuming side)
```

## Cross-rail context

| Joint | Status (26 May 2026) |
|---|---|
| KP-15 analytical surface (`/analytics/v1/*`) | ✅ SC-1 scaffold shipped 21 May |
| TD-14 `hakken.*` event ingest | ✅ Shipped 21 May (143/143 tests) |
| ID-14 cross-app consent surface Phase 1 | ✅ Shipped 22 May (Phase 2 still open) |
| Helpan H-9 / H-10 / H-12 per-app matchers | ✅ All closed 21 May (Klokd / Lunch Drop / family-discovery) |

## Stack lock

Node 22 LTS · TypeScript 5 strict · Fastify 4 · AJV 2020-12 · PostgreSQL 16 via Supabase **eu-west-1** · Drizzle ORM · postgres-js (`prepare: false`) · kafkajs · Vitest · Railway · pnpm workspaces + Turborepo · `@kmv/platform-shared` vendored.

Audit-log hash-chain `pg_advisory_xact_lock` key for Hakken: **`73210789`** (distinct from Identiti 73210123 / KP 73210456 / Helpan AI 7268010825743210).

## Hard rules (from `INSTRUCTION_PACK.md` §8)

- Code as files only, never chat blocks
- KES minor units only (no floats — Hakken doesn't handle money but consumes KP analytics; respect this)
- Drizzle migrations only (no raw SQL except hand-edited drizzle-kit output)
- No `Co-Authored-By: Claude` commit trailers
- Confirm scope before significant changes
- English-first default; Swahili via toggle (operator UI)
- No raw MSISDNs / no KYC docs in Hakken DB (Identiti owns those)
- RLS + `FORCE ROW LEVEL SECURITY` on every customer-tenant table

---

*Hakken Rail · 26 May 2026 · Confidential*
