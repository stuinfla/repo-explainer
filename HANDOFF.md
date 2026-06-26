# Repo Explainer — Session Handoff

**Last updated:** 2026-06-26 (Session 2)

The pipeline is **production-ready and verified working end-to-end**. A visitor can
submit a public GitHub repo and receive a polished, **publicly accessible** explainer
page plus a public GitHub repo, with an email notification sent from `stuart@isovision.ai`.

---

## Current status: working

| Capability | State | Evidence |
|---|---|---|
| Build pipeline (phases 0–9) | ✅ Passing | Runs ~2–2.5 min, all phases green |
| Content generation | ✅ Correct | Real repo name, single headings, no placeholder text |
| Images (hero + diagrams) | ✅ Generating | Hero at valid `1536x1024`; gallery populated; all load HTTP 200 |
| Vercel deploy | ✅ Working | Project linked via `VERCEL_PROJECT_ID`; fails loudly on error |
| Public access (no login) | ✅ Confirmed | SSO deployment protection disabled; every URL returns 200 unauthenticated |
| Email notification | ✅ Working | Gmail SMTP via `stuart@isovision.ai`, tested live |
| GitHub explainer repo | ✅ Public | `stuinfla/{repo}-explainer`, visibility public |

---

## What was fixed this session

1. **Secrets / credentials** — set `OPENAI_API_KEY` (from `.env`'s `OPEN_AI_KEY`),
   a durable classic `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `GMAIL_USER`,
   `GMAIL_APP_PASSWORD`.
2. **Email → Gmail SMTP** — replaced Resend with a zero-dependency SMTP client
   (`scripts/phase9-send-email.mjs`) using the Google app password. This is the
   only email path in the codebase.
3. **Image generation** — hero size was `1792x1024` (rejected by `gpt-image-1`);
   now `1536x1024`. Images are wired into the page: hero as a CSS background,
   diagrams into a `<!-- IMG:gallery -->` slot Phase 5 fills (or removes cleanly
   if an image fails — never a broken `<img>`).
4. **Content correctness** — sites were titled **"target-repo"** (the clone dir);
   now use the submitted repo name. Removed visible "Content will be filled in by
   Phase 4." placeholder text (was shipping 8×) and duplicate section headings.
5. **Visual polish** — hero image now dominates with a bottom-weighted scrim +
   text-shadow; use-case cards are styled in a responsive grid.
6. **Deploy robustness** — deploy used `VERCEL_ORG_ID` without `VERCEL_PROJECT_ID`
   and **failed silently** (the `| tail -1` masked the error and shipped a bogus
   URL). Now linked to the project, captures the URL robustly, exits 1 on failure,
   runs a post-deploy smoke test, and advertises a working public URL.
7. **Submission/waiting UX** (`www/main.js`) — recalibrated the progress estimate
   from a misleading "~6 minutes" to an honest "~3 minutes", corrected inaccurate
   step descriptions, and made the success screen show each result URL with a
   **Copy link** button + Open action.
8. **Public access** — disabled Vercel SSO deployment protection on the
   `repo-explainer` project so every deployment URL is viewable without login.

---

## The one external item I could not do: Cloudflare DNS

The custom-domain UX (`{repo}.repoexplainer.isovision.ai`) is the only thing not
live, because it needs a DNS record in **Cloudflare**, and there are no Cloudflare
credentials on this machine. The Vercel side is **already done** (the wildcard
domain `*.repoexplainer.isovision.ai` is attached to the `repo-explainer` project
and ownership-verified). Vercel reports the domain as `misconfigured: true` only
because the DNS record is missing.

**Add this one record in the Cloudflare dashboard for `isovision.ai`:**

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `*.repoexplainer` | `cname.vercel-dns.com` | DNS only (gray cloud) |

The pipeline already assigns the per-build alias and **self-heals**: the moment
this record resolves, builds automatically advertise the custom domain instead of
the `*.vercel.app` URL. Until then, everything works on the public `*.vercel.app`
URLs, so nothing is blocked.

---

## Known structural item (needs your decision — not urgent)

The submission site (`www/`) and the generated explainers currently both point at
the **same `repo-explainer` Vercel project**. Because each explainer build deploys
to that project's production, the project's production URL always shows the latest
*explainer*, not the submission form. Git auto-deploy is **off** (all deployments
are CLI/pipeline), so this is stable, but the submission form needs its **own**
Vercel project (root directory `www/`, with `GITHUB_TOKEN` + Vercel env set) and
the apex domain `repoexplainer.isovision.ai` once DNS is in place. The `www/` code
improvements from this session are committed and ready for whenever that project
is set up.

---

## Secrets (all set on `stuinfla/Repo-Explainer`)

| Secret | Purpose |
|---|---|
| `GH_PAT` | Repo creation, gist status, collaborator invite |
| `OPENAI_API_KEY` | Phase 4 content + Phase 5 images |
| `VERCEL_TOKEN` | Durable classic token — Phase 8 deploy |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | Link deploys to the `repo-explainer` project |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Phase 9 email via `stuart@isovision.ai` |

`.env` (local, git-ignored) also holds `VERCEL_TOKEN` for convenience.

---

## How to run a build

Via the API:

```bash
gh workflow run build-explainer.yml \
  -f target_owner=<owner> -f target_repo=<repo> \
  -f build_id=$(uuidgen) -f gist_id=TEST \
  -f submitter_email=you@example.com \
  --repo stuinfla/Repo-Explainer
```

> Note: Phase 7 invites the **target repo's owner** as a collaborator. Use your own
> repos for tests to avoid sending invites to strangers. `gist_id=TEST` is harmless
> for manual runs (gist updates just warn); the website supplies a real gist.

---

## Infrastructure reference

| Item | Value |
|---|---|
| GitHub repo | `stuinfla/Repo-Explainer` (main) |
| Vercel project | `repo-explainer` (`prj_KbSbSjdTfeGzW6x4O2TftTU8jXi1`) |
| Vercel org | `team_J1ktaVpPnXdvDZsFH9Z4yH6t` (`sikerr-6092`) |
| Public production URL | `https://repo-explainer-six.vercel.app` |
| DNS provider | Cloudflare (`hattie.ns.cloudflare.com`, `peter.ns.cloudflare.com`) |
| Domain pattern (pending DNS) | `{repo}.repoexplainer.isovision.ai` |
| Explainer repo pattern | `stuinfla/{repo}-explainer` |
