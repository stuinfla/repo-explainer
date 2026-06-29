<div align="center">

# Repo Explainer

### Turn any GitHub repo into a visual explainer page — for humans *and* their AI — in one line.

*Complex repos deserve clear introductions. This builds them.*

![Cinematic showcase of explainer pages floating above code — take something dense and technical, and turn it into something anyone can understand.](https://repo-explainer-website.vercel.app/assets/img/hero-showcase.png)

</div>

---

## Do it in three lines

```bash
# 1 — install nothing. Point it at any GitHub repo (it uses your own Anthropic key):
npx repo-explainer https://github.com/owner/repo

# 2 — walk away. It reads the repo, writes a plain-language walkthrough, generates the
#     hero imagery AND a real architecture + data-flow diagram from the actual code,
#     grades the result on mobile + desktop, and deploys it.

# 3 — you get back a LIVE explainer page (the link you share), a GitHub repo you own,
#     and a downloadable AI knowledge pack.
```

**Live in Claude Code instead? Two lines:**

```text
/plugin install repo-explainer
/repo-explainer https://github.com/owner/repo
```

> 🚧 **Honest status:** the engine is built and proven (see the live example just below). The `npx` package and the Claude Code plugin are **being published** — until that's live, the one-liner above won't resolve yet; today it runs as the Claude Code skill in this repo. We won't show the command as "done" until it actually installs from npm.

---

## See exactly what you get — a real one it built

This is the actual page the engine generated from [`ruvnet/agenticow`](https://github.com/ruvnet/agenticow), end to end:

### 👉 **[Open the live agenticow explainer →](https://stuinfla.github.io/Repo-Explainer/agenticow/)**

A captivating hero, a plain-language walkthrough, **a real architecture diagram and a data-flow diagram drawn from agenticow's own code structure**, concrete use-cases, and a one-click AI knowledge pack. That's the bar: a developer opens it and thinks *"oh — I get it, and I want this."*

Every run produces **two artifacts**, both quality-gated:

![One download, two halves: an explainer website for humans on the left, and a drop-in smart zip for your AI on the right.](https://repo-explainer-website.vercel.app/assets/img/dual-hero-output.png)

- **The explainer website** — so a *human* gets it. The page you forward to people.
- **The drop-in smart zip** — so their *AI* gets it. A vector knowledge base of the repo + a search tool + an MCP server, so Claude Code or Cursor answer from the real source instead of guessing.

---

## What the experience actually looks like

1. **Run one line** (or paste a GitHub URL on the site).
2. **Walk away.** A few minutes later you get the live URL — in your terminal and by email.
3. **Click it.** There's your explainer — exactly like the agenticow page above. Share that link anywhere; it's the welcome mat your README never was.

You're invited as a collaborator on the explainer's own GitHub repo, so you can edit it. It's yours.

---

## 🖼️ Live examples

Five real repos, five completely different explainers — same engine, same quality bar. Click any to see it live.

| | | |
|---|---|---|
| [**MetaHarness**](https://metaharness-explainer.vercel.app)<br>Gives any project its own AI assistant that knows *that* project. | [**PhotonLayer**](https://photonlayer-explainer.vercel.app)<br>Optical-AI: light computes the answer before any chip wakes up. | [**ruqu**](https://ruqu-explainer.vercel.app)<br>A quantum-computing simulator in your browser, Rust + WASM. |
| [**ruvn**](https://ruvn-explainer.vercel.app)<br>Turns a question into a graded, cited evidence dossier. | [**Agentic QE**](https://agentic-qe-explainer.vercel.app)<br>Replaces manual testing with a fleet of specialist AI agents. | [**agenticow**](https://stuinfla.github.io/Repo-Explainer/agenticow/)<br>Git for agent memory — copy-on-write vector branching. |

---

## How it works

One Claude Code **skill** is the brain; small, pure **tools** do the mechanics; one data contract flows between them. No brittle pipeline.

**Understand → Conceive → Author → Visualize → Assemble + Pack → Quality gate ⟲ → Deploy → Notify**

- **Understand** builds a real RVF vector knowledge base from the repo (the `kb/` engine, `bge-small-en-v1.5` embeddings).
- **Conceive** invents the page's visual metaphor, palette, and voice — bespoke per repo.
- **Visualize** uses `gpt-image-2` for the emotional imagery and `ascii-to-svg` for crisp, *explanatory* architecture + data-flow diagrams (mandatory on every page — "how is it built / how does it work").
- **Quality gate** screenshots the real page at mobile (390px) and desktop (1440px) and a vision model scores it on two rubrics — *do they get it?* and *did someone who gives a shit make this?* It refines until it clears the bar, calibrated against the example explainers above.

The full recipe lives in [`docs/adr/0005-skill-based-explainer-recipe.md`](docs/adr/0005-skill-based-explainer-recipe.md); the domain model in [`docs/ddd/repo-explainer-recipe-domain.md`](docs/ddd/repo-explainer-recipe-domain.md).

---

## Built with

| Layer | Tool |
|---|---|
| Knowledge base | RVF single-file vector DB (`@ruvector/rvf`) + `bge-small-en-v1.5` (local, 384-dim) |
| Imagery | `gpt-image-2` (illustration) + `ascii-to-svg` (diagrams) |
| Quality gate | Playwright dual-viewport render + GPT-4o vision grading |
| Hosting | Netlify (provider-agnostic adapter) |

---

## Credit

The tools in the gallery above belong to [Reuven Cohen / @ruvnet](https://github.com/ruvnet). Repo Explainer is an independent project that exists to help more people discover, understand, and adopt great work.

---

<div align="center">

Built by **Stuart Kerr** at **[ISOvision.ai](https://isovision.ai)**.

*Complex repos deserve clear introductions.*

</div>
