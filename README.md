<div align="center">

# Repo Explainer

### Turn any GitHub repo into a polished visual explainer — plus a downloadable AI knowledge pack.

*Take a newcomer from "I've never seen this before" to "I get it — and I want to use it."*

</div>

---

## The problem

Most repos are written by people who already understand the project, for people who already understand the project. A brilliant tool ships, a curious developer lands on the README, hits a wall of jargon, and quietly closes the tab — not because the tool isn't good, but because the *introduction* isn't. Engineers ship things assuming people know why they'd care. They usually don't.

## What it does

**Repo Explainer reads a repository and produces a standalone, art-directed explainer page** — a captivating hero, a plain-language walkthrough, explanatory diagrams, real-world use-cases, and a downloadable AI knowledge pack — that lives at its own URL and is the page you *forward* to people. It's the welcome mat for your project; your README stays the technical reference.

Each explainer is **unique by default** (its own visual metaphor, palette, and voice) but **reliably great by construction** — every one is responsive, accessible, grounded in the repo's real source, and only ships once it clears a hard visual-quality bar on both mobile and desktop.

## What you get

1. **A live explainer page** at its own URL — the thing you share.
2. **A GitHub repo** for that page — you're a collaborator, so you can edit it; separate from your app's repo.
3. **A downloadable AI knowledge pack** (an RVF vector knowledge base + search tool + MCP server) — so other people's AI assistants understand your project from the real source, not guesses.

## How you run it — one brain, three doors

The logic is **one Claude Code skill**. Three thin doors call that same skill, so the result is identical however you run it:

| Door | One-liner | For |
|---|---|---|
| **Claude Code plugin** | install once → `/repo-explainer <github-url>` | developers on Claude Code |
| **npx CLI** | `npx repo-explainer <github-url>` | anyone (uses their own Anthropic key) |
| **Website** | paste a URL on the page | anyone, zero install |

## How it works

A single intelligent process — the **brain** makes the judgments, **pure tools** do the mechanics, and one in-memory contract flows between them (no brittle inter-step file coupling):

**Understand → Conceive → Author → Visualize → Favicon/Social → Assemble + Pack → Quality gate ⟲ → Publish/Deploy → Notify**

- **Understand** builds a real RVF vector knowledge base from the repo (the `kb/` engine).
- **Conceive** invents the page's visual metaphor, palette, and voice — bespoke per repo.
- **Visualize** uses `gpt-image-2` for the emotional imagery and `ascii-to-svg` for crisp, *explanatory* architecture diagrams, ordered high-level → detail.
- **Quality gate** renders the real page on mobile (390px) and desktop (1440px), screenshots both, and a vision model scores them on a **dual rubric** — *do they get it?* (substance) and *did someone who gives a shit make this?* (craft) — each criterion 0–100. It does not ship until **every line clears 95 on both devices**. The bar: a developer looks at it and *smiles*.

The full, QA'd recipe lives in [`docs/adr/0005-skill-based-explainer-recipe.md`](docs/adr/0005-skill-based-explainer-recipe.md) and the domain model in [`docs/ddd/repo-explainer-recipe-domain.md`](docs/ddd/repo-explainer-recipe-domain.md).

## Built with

| Layer | Tool |
|---|---|
| Knowledge base | RVF single-file vector database (`@ruvector/rvf`) + `bge-small-en-v1.5` embeddings |
| Imagery | `gpt-image-2` (illustration) + `ascii-to-svg` (diagrams) |
| Quality gate | Playwright dual-viewport render + GPT-4o vision grading |
| Hosting | Netlify (provider-agnostic adapter) |

## Status

🚧 **Building** — the engine is being implemented as a Claude Code plugin per ADR-0005. The recipe and domain model are complete and QA-passed.

---

<div align="center">

Built by **Stuart Kerr** at **[ISOvision.ai](https://isovision.ai)**.

</div>
