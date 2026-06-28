# ADR-0004a — Gap Resolutions (addendum to ADR-0004)

Updated: 2026-06-27 00:00:00 EDT | Version 1.0.0
Created: 2026-06-27 00:00:00 EDT

**Status:** Accepted. **Supersedes** any conflicting text in ADR-0004 and
`docs/ddd/repo-explainer-domain.md`. This addendum is the single authority on the 20
QA gaps (7 critical + 13 high). Where a station number, package name, command, or
dimension below differs from the parent docs, **this file wins.** Every command/flag/
package here was verified against the live npm registry, Vercel CLI **54.17.2**, the
`gpt-image-1` Images API limits, and the repo's actual files/scripts on 2026-06-27.

**Canonical station order (all docs converge here):**
1 UNDERSTAND → 2 AUTHOR → 3 VISUALS → 4 FAVICON → 5 STUDIO *(async, quarantined)* →
6 ASSEMBLE+PACK → 7 SEO → **8 DEPLOY** → **9 QUALITY+REFINE (grades the LIVE page)** →
10 PUBLISH → 11 NOTIFY. **DEPLOY < QUALITY < PUBLISH** is invariant.

---

## CRITICAL

### C1 — RVF KB toolchain: drop `@rvf/forge`; vendor the forge scripts
`@rvf/forge`, `@ruvector/search-cli`, `@ruvector/mcp-server` all return **npm 404** —
fictional. The real, proven toolchain is the **rvf-kb-forge skill's vendored scripts**
(`~/.claude/skills/rvf-kb-forge/assets/`). Vendor `forge-build.mjs` into
`scripts/phase2-build-rvf-kb.mjs` and run it directly:
`node scripts/phase2-build-rvf-kb.mjs --repo <clone> --out kb/stores/{buildId} --name {buildId}`.
It writes `{buildId}.rvf` + `{buildId}.passages.jsonl` + `{buildId}.rvf.embed.json` +
`{buildId}.meta.json` using local ONNX embeddings — query side is `@ruvector/rvf@0.2.2`
(real) + `@xenova/transformers`. **Embedder:** this repo's shipped KBs use
`Xenova/bge-small-en-v1.5` (384-dim, cls-pooled, query-prefixed — see
`kb/stores/ruqu/ruqu-kb.rvf.embed.json`), and the model is already cached at
`kb/models-cache/Xenova/bge-small-en-v1.5/`. Standardize Station 1 on **bge-small (384-dim)**
to match the cache and existing stores (forge-build's MiniLM default is fine but would
require a second model download). Set `KB_MODEL_CACHE` to that cached dir so CI does not
cold-download per build (a Phase 0 step warms it once). **Done = a CI run produces the
three sidecars AND a query returns real passage TEXT**, not just `{id,distance}`.

### C2 — Per-build Vercel isolation: `--name` is gone; link a per-build project first
Vercel CLI 54.17.2 `vercel deploy --help` exposes `--project <NAME_OR_ID>` and **no
`--name`** (removed years ago). An unlinked deploy from a fixed `explainer-site/` dir
auto-binds to a CWD-named shared project → the overwrite trap. **Fix (Station 8):**
```
vercel link --yes --project re-{repo}-explainer --scope sikerr-6092 --token "$VERCEL_TOKEN"
vercel deploy --prod --yes --scope sikerr-6092 --token "$VERCEL_TOKEN"
```
`vercel link --project` **auto-creates** the project if absent; deploy then targets that
linked `.vercel/project.json`. Remove the old `vercel pull` + shared `VERCEL_PROJECT_ID`
path. **Hard guard:** after deploy, read `.vercel/project.json` and assert
`projectId != prj_KbSbSjdTfeGzW6x4O2TftTU8jXi1` (the landing project, confirmed in
`www/.vercel/project.json`); fail the build if equal. **Done = two concurrent builds land
in two distinct projectIds (printed in logs).**

### C3 — Custom domain ⊕ per-build isolation: attach the subdomain to the build's project
A single Cloudflare wildcard `*.repoexplainer.isovision.ai → cname.vercel-dns.com` can
attach to **exactly one** Vercel project, so it cannot route dozens of isolated projects.
**Fix:** after `vercel link` (C2), attach the specific subdomain to *that* project, then
alias the deployment to it:
```
vercel domains add {repo}.repoexplainer.isovision.ai re-{repo}-explainer --scope sikerr-6092 --token "$VERCEL_TOKEN"
vercel alias set "$DEPLOYMENT_URL" {repo}.repoexplainer.isovision.ai --scope sikerr-6092 --token "$VERCEL_TOKEN"
```
(The apex `repoexplainer.isovision.ai` must be verified on team `sikerr-6092` once; the
wildcard CNAME stays in Cloudflare so each new subdomain resolves without per-build DNS.)
This is **not best-effort** — `domains add` is a hard step. **Genuinely needs one live
proof** (see Readiness): confirm `curl -I https://{repo}.repoexplainer.isovision.ai` → 200
on a real isolated build. If `domains add` proves unworkable at scale, the documented
fallback is to accept the `*.vercel.app` URL as the delivered link — but that is a
conscious downgrade, not a silent one.

### C4 — Never-fail-silently spine (email persist + sweeper + cancellation)
Four holes, one fix set. **(a)** `www/api/build.js` statusPayload (line ~136) has no
`email` field, so the sweeper can't notify — **persist `submitter_email` into the per-build
status gist at creation.** **(b)** Cancellation / runner-death / GHA 6h timeout never fire
`if: failure()` — add a **StatusChannel Sweeper** with a concrete home: a **Vercel Cron on
the landing project** (`www/vercel.json` `"crons": [{ "path": "/api/sweep", "schedule":
"*/10 * * * *" }]`, handler `www/api/sweep.js`) that lists the build status gists, patches
any `running` gist older than **20 min** to `failed`, and sends the failure email from the
stored address via the same SMTP path as `phase9-send-email.mjs`. **(c)** Broaden the
in-band handler to `if: failure() || cancelled()` so cancellation is covered in-band; rely
on the sweeper only for runner-death/timeout (which emit no event at all). **Done = a forced
cancel and a queued-never-started build each produce exactly one honest failure email and a
terminal gist state.**

### C5 — NOTIFY failure must not invert a Succeeded build
NOTIFY is Station 11; an SMTP hiccup currently flips a live build to `failed`
(`phase9-send-email.mjs` exits 1 on any SMTP error, and `if: failure()` then patches the
gist `done → failed`). **Fix:** mark **every terminal step** (`done` gist PATCH + success
email) `continue-on-error: true`; set `REACHED_TERMINAL=true` into `GITHUB_ENV` immediately
before the notify block; gate the failure handler with
`if: (failure() || cancelled()) && env.REACHED_TERMINAL != 'true'`. A notify/gist-patch
failure degrades to a `::warning::`, never to a Failed terminal state — matching DDD §4.2
(`NotificationFailed → Succeeded`) and INV-04 (single terminal state).

### C6 — Cloud NotebookLM worker: honestly designed-not-built; stays quarantined
The studio worker (headless Chrome + the `nlm` Python CLI + Google SSO) is **not proven in
the cloud.** `/opt/homebrew/bin/nlm` is a Python shim driving the NotebookLM web app via a
Google-authed browser over CDP; today's **only working path** is Mac-local
(`nlm login --provider openclaw --cdp-url http://localhost:9222`, per
`scripts/seed-agentdb.sh:22`) — exactly the Mac dependency the cloud engine removes.
Headless datacenter-IP Google login is the documented risk; a "self-refreshing headless
login" is **not** a credible mitigation. **Decision:** the realistic cloud design is a
**long-lived authenticated VM** (one-time interactive SSH login establishes a persistent
Chrome profile; the worker reuses it; weekly re-auth alarm if the cookie lapses) — NOT
ephemeral headless containers. Studio is **best-effort, quarantined** (INV-09): the build
ships a studio-less live page first and Station 5 runs async; every `nlm` failure is caught
and the build still reaches Succeeded. **Smallest proving test (genuinely open):** on the
chosen VM, run `nlm login` once interactively, then `nlm list artifacts <NOTEBOOK>` and
`nlm download audio <NOTEBOOK> -o /tmp/a.m4a` non-interactively from a fresh SSH session —
prove ONE studio asset end-to-end before committing the cloud studio path. Until that
passes, studio is **designed-not-built** and labeled so.

### C7 — Hero dimension: 1536×1024 (the only value `gpt-image-1`/`gpt-image-2` accept)
The verified working engine in `scripts/phase5-generate-images.mjs` is **`gpt-image-1`**,
whose Images API accepts only `1024x1024`, `1024x1536`, `1536x1024`, `auto` (the code
comment at line 44–45 states this). **1792×1024 is a DALL·E-3 size and is rejected** — so
ADR-0004's earlier `1792×1024` was impossible. **Canonical hero = 1536×1024**, primary
engine **gpt-image-2** (with `imagen-4.0-ultra` then `gemini-3-pro-image` as verified-working
fallbacks on this project's keys); 1536×1024 is the widest landscape all three support and
matches every shipped `og:image`. The `repo-explainer-domain.md` invariant ("Hero MUST be
1536×1024") is correct and stands. Because 1536×1024 (1.5:1) is not the ideal 1.91:1
social-card ratio, generate a **dedicated 1200×630 OG crop** alongside the hero for the
`og:image`.

---

## HIGH

### H1 — DEPLOY before QUALITY: renumber the DDD to match ADR-0004
QUALITY+REFINE must screenshot the **LIVE** page (DDD §5.9), which is impossible before the
first deploy. **Canonical:** DEPLOY (8) → QUALITY+REFINE (9, grades live, re-deploys the
SAME linked per-build project in the loop) → PUBLISH (10) → NOTIFY (11). The DDD state
machine and context map are renumbered to put `HostingDeploy` strictly upstream of
`QualityRefinement`; a passing live-page grade is a hard precondition of the terminal state.

### H2 — Studio placement: one model (async-after-deploy, re-graded)
Studio is **async after the first deploy**, then on `StudioBuilt` it triggers
**re-assemble → re-deploy (same project) → re-grade (dual-viewport) → follow-up email**
("studio now live"). The studio GHA job is gated on **build success** (`needs: build` with
an explicit success guard — **not** bare `if: always()`, which would run it on failed builds
and email "your explainer is live" when no page exists). The ResponsiveBar assertion
`studio-audio-present` is **conditional on `studioIncluded`** and graded only on the
post-studio redeploy — never on the initial studio-less ship.

### H3 — Honest failure email naming the failed station
The `if: failure()` handler today sends **no email** and records
`FAILED_STEP=${{ github.action }}` (GHA's internal step id, e.g. `__run`, not a station
name). **Fix:** each station writes its human name to `GITHUB_ENV` as `CURRENT_STATION`
before its work step; the failure handler reads it for a "failed at {station}" message and
calls `phase9-send-email.mjs` with a **failure template**. **Remove the `HAS_GMAIL`
if-gate** (`env.HAS_GMAIL == 'true'` is false at if-eval and silences the notice exactly
when email is misconfigured); replace it with a **Phase 0 preflight** that hard-fails if
`GMAIL_APP_PASSWORD` is unset while an email was promised (no `phase0` script exists yet —
add `scripts/phase0-preflight.mjs`).

### H4 — RVF-build failure must not silently degrade to JSON
ADR-0004:653's "fallback to JSON analysis only" **violates INV-07 / ADR-0002 OC-C** (a JSON
KB is a defect). **Removed.** Station 1 RVF-build failure must **retry once**, then **hard-fail
with an honest failure email** (C3/H3) — never ship a JSON-grounded page. Canonical KB path is
`kb/stores/{buildId}/{buildId}.rvf` (matches existing stores and DDD §11); the old
`kb-output/repo.rvf` is dropped.

### H5 — Knowledge Pack: ship passages + the real search CLI + real MCP server
The zip must contain **`{buildId}.rvf` + `{buildId}.passages.jsonl` + `{buildId}.rvf.embed.json`
+ `forge-ask.mjs` (search CLI) + `forge-mcp.mjs` (MCP stdio server) + `primer.md` +
`package.json` (the vendored `bundle-package.json`, deps `@ruvector/rvf` + `@xenova/transformers`,
`bin: {forge-ask, forge-mcp}`) + README.md**. Without `.passages.jsonl` the pack returns
`{id,distance}` with no text — a dead differentiator. The MCP server is the bundled
`forge-mcp.mjs` (joins ids→passage text); **do not** reference `@ruvector/search-cli` /
`@ruvector/mcp-server` (npm 404) or `@ruvector/rvf-mcp-server` (non-functional stub). End user
runs `npm i` in the unzipped dir (pulls `@ruvector/rvf` + native `@ruvector/rvf-node@0.1.8`),
then `node forge-ask.mjs` or the MCP server. **Test on a clean machine that the MCP server
installs and returns TEXT.**

### H6 — For-humans primer rendered ON the page (not only in the zip)
Add an explicit page slot in Station 6 that renders the **ForHumansPrimer** into the
download section of `index.html` (today `primer.md` exists only inside the zip). The
state machine gets a ContentSlot + placement event so the primer is a graded on-page
deliverable.

### H7 — SEO on both surfaces: repo README + page sitemap/JSON-LD/canonical
Add a Station 7 step that authors a **keyword-rich `README.md` for the published explainer
repo** (distinct from `index.html`). Extend `phase3-scaffold.mjs` to emit **`sitemap.xml`**,
**JSON-LD `SoftwareSourceCode`** (`application/ld+json`), and a **`<link rel="canonical">`** —
the scaffold currently emits only og/twitter + robots.txt. **Gate F asserts all three files/
tags exist.** Add a vision check of the rendered OG card so the share-link preview is actually
verified, not assumed.

### H8 — Quality threshold + non-converging terminal behavior
Calibrate **one** threshold against the 5 hand-curated live examples FIRST (ADR's
MIN_SCORE=80 vs DDD's 75 — resolve by calibration, not assertion). **Hard gate = a
deterministic, non-LLM responsive guard** (no horizontal overflow, hero image loaded,
tap-target sizes ≥44px, all links 200) at BOTH 390px and 1440px; the GPT-4o aesthetic score
is **advisory** (prevents an LLM-patches-CSS oscillation loop). **Terminal behavior:** after
`MAX_REFINE_ITERATIONS`, ship the **best-of-N as Succeeded-with-caveat** with honest scores
in the email — never hard-Fail a deployable page on aesthetics. Stop the "completes only when
GREAT" claim; the truthful claim is "completes when the deterministic responsive hard gate is
green; aesthetic score reported honestly."

### H9 — Concurrency SLA stated honestly + Vercel project housekeeping
**Core build** scales on GHA (the `slot-${{ github.run_number % 5 }}` cap = **5 concurrent
builds**); **studio** is **2–3 concurrent VM sessions, best-effort, will lag under load** —
say so in the email rather than implying every user gets a studio. Use **per-repo concurrency**
for dedupe and a **separate global cap** (two distinct `concurrency` groups cannot both attach
to one job). The **sweeper (C4)** also cleans the active-builds gist on cancel (prevents 429
lockout). Move the in-memory rate-limit state (`build.js:9`) into the gist. Tighten per-build
Vercel **project housekeeping to daily** (delete projects older than N days) given dozens/day,
not monthly.

---

## Readiness

**18 of 20 gaps are resolved now with real, verified fixes** (C1, C2, C4, C5, C7, H1–H9 are
fully closed by doc decision + verified commands/packages; C3 and C6 are designed and
specified with the exact verified commands but each carries **one genuinely-open live proof**).

**2 gaps remain open pending a live proving test — both already de-risked to "designed,
needs proof," neither blocks doc convergence:**
- **C3 (custom domain on isolated project):** commands verified to exist; must prove
  `vercel domains add {repo}.repoexplainer.isovision.ai re-{repo}-explainer` + alias yields a
  **200** on one real isolated build. Fallback (`*.vercel.app`) is documented.
- **C6 (cloud NotebookLM SSO):** honestly designed as a long-lived authenticated VM; must
  prove **one studio asset end-to-end** from a non-interactive session before committing the
  cloud studio path. Studio stays quarantined so this never blocks a build.

**Net: GO to converge the docs and build Stations 1–11, with C3 and C6 gated behind their two
prototypes before the cloud-only domain and studio decisions are locked.**
