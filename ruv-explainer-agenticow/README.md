# agenticow — Explainer Site

A plain-English explainer for **[agenticow](https://github.com/ruvnet/agenticow)** by
**Reuven Cohen / [@ruvnet](https://github.com/ruvnet)** — *"Git for Agent Memory."* Instead of
copying an AI agent's entire vector memory to snapshot, fork, or checkpoint it, agenticow
**branches** it — copy-on-write, like Git — so a fork, checkpoint, or rollback costs about
**162 bytes and 0.47 ms**, flat, no matter how big the memory is.

This site is part of the Repo-Explainer pipeline. It is an independent explainer; all numbers
and quotes are grounded in the source repo at the SHA shown on the page. Nothing is invented.

## Structure

```
ruv-explainer-agenticow/
├ index.html            # the site — 11 collapsible numbered sections, dual-level visuals
├ styles.css            # BRANCH-GRAPH / GREEN-INK theme (distinct per repo, constraint K)
├ main.js               # collapsible sections, smooth nav, live-provenance refresh, copy-to-clip
├ favicon.svg           # branch-graph mark (base node forking into children)
├ vercel.json           # static hosting config
├ package.json          # local dev server
├ robots.txt
└ assets/
   ├ img/               # friendly raster on-ramp illustrations (gpt-image-2)
   └ diagrams/          # (reserved) — technical diagrams ship as inline SVG in index.html
```

## Run locally

```bash
npm run dev      # serves on http://localhost:4321
```

## Provenance

- Source: <https://github.com/ruvnet/agenticow> @ `3d93dc348b88cdc7e5cb251e89219a05b11dd784`
- Live demo: <https://ruvnet.github.io/agenticow/>
- npm: `agenticow` (0.2.3)
- License (agenticow): MIT © ruvnet
- Updated: 2026-06-29
