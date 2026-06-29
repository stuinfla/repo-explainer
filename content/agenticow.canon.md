# agenticow — Resonance Canon (the content standard)

> Purpose: the concrete, non-ethereal way to explain **agenticow** so a **non-technical Claude-Code user** goes "oh — *that's* what it's for." This is the binding content for the hero + §01 + the lead example + the use-case gallery of the agenticow explainer site. Every claim here is grounded in the real repo (`github.com/ruvnet/agenticow`, HEAD `3d93dc348b88cdc7e5cb251e89219a05b11dd784`, short `3d93dc3`, on `main`). No invented features. Author/attribution: **Reuven Cohen / @ruvnet** · License **MIT © ruvnet** · npm package `agenticow` (v0.2.3) · live demo <https://ruvnet.github.io/agenticow/>.
>
> Sourcing note: the GitHub git-trees / line-numbered raw endpoints were rate-limited (HTTP 403) during the research pass, so claims are cited to the **named file and section** (README, `package.json`, `examples/README.md`, `bin/agenticow.js`) with the exact text quoted, rather than to line numbers. Where the repo contradicts itself, both readings are surfaced (see "Honest limits").

## The one plain sentence (lead with this)
**agenticow is "Git for Agent Memory": instead of copying an AI agent's entire vector memory every time you want a private version of it, agenticow *branches* it — copy-on-write, like Git — so a fork, checkpoint, or rollback costs about half a millisecond and 162 bytes no matter how big the memory is.**

(Grounded: README title — *"agenticow — Git for Agent Memory: Copy-On-Write vector branching (83× faster, 3000× smaller snapshots)"*; tagline — *"agenticow turns memory from a static database into a branchable runtime primitive for agents."*)

## Translate the abstraction down to earth (kill the jargon)
The repo's sharpest line is *"Every other vector store makes you **full-copy** the index to snapshot, fork, or checkpoint it. `agenticow` **branches** it — copy-on-write, like Git."* True, but a normal person needs it grounded:

- **What is an agent's "memory"?** Modern AI agents remember things by turning text into long lists of numbers (**vectors / embeddings**) and storing them in a **vector database** so they can later find "the most similar thing I've seen before." That store *is* the agent's memory.
- **The expensive habit:** the moment you want a *separate* version of that memory — one per customer, a throwaway sandbox to test a risky import, a safety checkpoint before a tool call — every normal vector database makes you **copy the whole thing**. At a million vectors that's *"496 MB and 67 ms — every time"* (README "Why").
- **What agenticow does instead:** it **branches** the memory the way Git branches code. A branch records *"**only its own edits** plus a pointer to its parent. Creating one is constant-time and constant-size — **162 bytes** — independent of base size."* (README "How copy-on-write for vectors works".) So 1,000 private versions of a giant memory cost almost nothing.
- **The Git analogy the repo leans on (use it):** *"Git doesn't make developers write better code — it lets thousands of them work concurrently, isolate mistakes, roll back, and merge through CI. agenticow is the same shape for cheap-model fleets."* "COW" = **C**opy-**O**n-**W**rite (and yes, the name is a pun on the cow).

**Honest framing the repo insists on:** agenticow is *"Git for agent memory, **not** a way to make agents smarter… The honest claim is leverage, not intelligence."* It's plumbing that makes running many isolated agent-memories cheap and safe — it does not improve the model's reasoning.

## Answer the stakes, explicitly and early
- **What does it actually do?** It lets one shared vector memory be forked, checkpointed, rolled back, diffed, and merged ("promoted") — each operation cheap and isolated — through a tiny JavaScript library and a CLI. (README "API".)
- **Why do I care?** Because the thing that was *"496 MB and 67 ms"* per copy becomes *"**162 bytes and 0.47 ms**, flat"* (README "Why"). That turns "give every user their own memory" or "run 1,000 parallel experiments off one base" from a budget-buster into a near-free operation.
- **Why do I need it?** Agents increasingly need memory that *branches*: *"a per-user personalization layer, a sandbox to test a risky ingest, a checkpoint before a tool call, a thousand parallel experiments off one shared base."* (README "Why".) Without copy-on-write, each of those is a full copy of the whole index.
- **Why is it important now?** The repo's thesis is *"smarter **orchestration**, not smarter **execution**"*: with cheap models, the win comes from running *many* cheap, isolated attempts and throwing the failures away for free. agenticow makes failure free — *"'throw it away and try a fresh independent attempt' beats 'make it reflect on its mistake.'"* It's *"infrastructure that turns 'run 1,000 cheap agents safely' into a tractable, near-free operation."*

## THE grounding example (concrete, relatable, before→after) — use this as §01's anchor
**Sofia runs a small SaaS writing-assistant.** Every customer's assistant should remember *their* documents, *their* style, *their* corrections — privately. She is not a database engineer; she just needs each customer to have their own memory without it costing a fortune or leaking across accounts.

- **Before:** To give each customer a private memory, Sofia's only option is to **copy the shared base index** for every one of them. With a real-sized memory that's hundreds of megabytes and tens of milliseconds *per customer*, every time. A thousand customers is hundreds of gigabytes of near-identical copies — so in practice she can't afford per-customer memory at all, and bolts everyone into one shared store (where one customer's data can surface in another's results).
- **After agenticow:** Sofia keeps **one base** and gives each customer a **branch**. A branch is *"162 bytes"* and takes *"~0.5 ms"* to make, *"any base size"* (README "Quick start" comment). A customer's private notes live in their branch; a query *"walks the lineage chain (child → … → base), merges results, lets the **child win** on id collision, masks anything the branch **tombstoned**, and re-ranks by exact distance"* — so each customer sees their own memory layered over the shared base, and **nothing else**. The repo's measured multi-tenant run: *"1,000 isolated tenant branches… 0/200 leaks, 2.4 KB/tenant, 530× less disk than full copies"* (`examples/multi-tenant-saas.mjs`). If a customer's nightly import goes wrong, Sofia `rollback()`s **that one customer** to a checkpoint in about half a millisecond — *"Rollback latency p50 = 0.571 ms"* (acceptance run) — without touching anyone else.
- **The "oh, that's what it's for" line:** *It's the difference between photocopying the entire filing cabinet for every customer, and giving each one a transparent overlay sheet that only records what they changed.*

> Honest hedge the repo demands: the per-tenant isolation is real and measured, but agenticow *"concedes raw single-index ANN throughput to dedicated vector DBs"* — Sofia's win is **cheap isolation, instant rollback, and auditable lineage**, not "the fastest possible search." If she needed maximum raw search speed on one static index, the repo itself says to use a dedicated ANN library.

## The collapsible gallery — varied real-world uses (each: situation → command → what it does → what you get)
Sequence AFTER the grounding example, BEFORE "how to implement." Each card has its own diagram. Every example below maps to a **real runnable script** in `examples/` (per `examples/README.md`).

1. **Run a thousand cheap agents in parallel — safely.**
   *Situation:* you want to fan a task out to many cheap-model attempts and keep only the winners.
   *Command:* `node examples/parallel-agents.mjs`
   *What it does:* *"fork N branches from a base, ingest + tombstone per branch, query each, roll one back"* — each agent gets an isolated memory off one shared base; failures are discarded for free.
   *What you get:* N independent agent-memories for ~162 bytes each, so "try 1,000 attempts and throw the bad ones away" is near-free. *Visual:* one base node → fan-out of branch nodes, a few greyed-out (discarded), one promoted.

2. **Per-customer / multi-tenant memory (one base, a branch per tenant).**
   *Situation:* a SaaS product where every customer needs private memory that can't leak.
   *Command:* `node examples/multi-tenant-saas.mjs`
   *What it does:* spins up *"1,000 isolated tenant branches"* over a shared base and probes for cross-tenant leaks.
   *What you get:* measured *"0/200 leaks, 2.4 KB/tenant, 530× less disk than full copies."* *Visual:* shared base → 1,000 thin overlay branches, a leak-probe arrow bouncing off the isolation boundary.

3. **Sandbox an untrusted document (red-team / prompt-injection safety).**
   *Situation:* you must ingest a document you don't trust without letting it poison the real memory.
   *Command:* `node examples/red-team-sandbox.mjs`
   *What it does:* the untrusted doc lands in an **isolated fork**; a deterministic injection-distance probe gates it; if it's an exploit you `rollback()`.
   *What you get:* *"1.1 ms, 0 vectors reached base"* — the attack is contained and erased without ever touching production memory. *Visual:* poison doc → quarantined fork → rollback, base untouched.

4. **Time-travel debugging & crash-recovery checkpoints.**
   *Situation:* a latent bug corrupted the agent's memory and you need to rewind past it.
   *Command:* `node examples/time-travel-debug.mjs` (and `examples/checkpointing.mjs`)
   *What it does:* `checkpoint()` freezes restore points; `rollback(checkpointId)` discards everything since — no replaying the agent's steps.
   *What you get:* the corrupted state rewound to a known-good point in well under a millisecond. *Visual:* timeline of checkpoints, a rewind arrow snapping back to "clean."

5. **A/B test at scale, then promote the winner.**
   *Situation:* you want to try many memory variants and merge the best one into production.
   *Command:* `node examples/ab-at-scale.mjs` (128 variants) → `node examples/promotion-pipeline.mjs`
   *What it does:* branches 128 variants off one base; the promotion pipeline runs *agent → sandbox → review → prod*, using `diff()` and `promote(target)` to *"replay this branch's edits into target"* (a Git-style merge).
   *What you get:* a scaled experiment plus a gated path to ship the winner. *Visual:* 128 branches → a deterministic gate → one branch promoted into the trunk.

6. **Compliance, lineage & GDPR right-to-erasure.**
   *Situation:* a user invokes "delete my data" and you must prove it's gone.
   *Command:* `node examples/compliance-lineage.mjs`
   *What it does:* `lineage()` / `status()` give an auditable parent/label/timestamp trail; because each user's data lives in their own branch layer, you **drop that layer** to surgically erase them.
   *What you get:* provable, scoped deletion plus an audit trail — instead of hunting one user's vectors out of a shared index. *Visual:* lineage tree → one user's layer detached and shredded, the rest intact.

7. **Verify the headline numbers yourself.**
   *Situation:* you don't believe "162 bytes / 0.47 ms / 83× / 3000×."
   *Command:* `npx agenticow bench` (and `agenticow acceptance` / `npm run acceptance`)
   *What it does:* runs the benchmark and the acceptance suite that produce `bench/acceptance-results.json`.
   *What you get:* the branch-cost, rollback-latency, and disk-savings figures reproduced on your own machine — *"tests 8/8 passing."* *Visual:* a bench readout: branch 162 B / 0.47 ms, rollback p50 0.571 ms, full-copy 496 MB / 67 ms struck through.

## §Drop-in / "how do I actually use it" — show the ACTUAL contents
agenticow is a **small JavaScript (ESM) library + CLI**, not a model or a service. The drop-in visual is an annotated map of the **real package** (reconstructed from `package.json` `files` + README references — treat the exact tree as approximate, the trees API was unavailable):

```
agenticow  (one npm package · ESM · Node ≥ 18 · MIT © ruvnet)
├ src/index.js          — the library: open / branch / fork / query / delete /
│                          checkpoint / rollback / diff / promote / lineage      ← the heart
│  └ index.d.ts         — TypeScript types
├ bin/agenticow.js      — the CLI: init · ingest · branch · checkpoint · rollback ·
│                          diff · promote · query · lineage · demo · bench · acceptance  ← front door
├ examples/             — 16 runnable .mjs scripts (parallel-agents, multi-tenant-saas,
│                          red-team-sandbox, time-travel-debug, ab-at-scale, …)   ← the proof
├ bench/                — bench.js · acceptance.js · claim-ladder.js · acceptance-results.json
├ test/                 — *.test.js  (README badge: tests 8/8 passing)
└ depends on: @ruvector/rvf-node ^0.2.0  — the prebuilt native (Rust/NAPI) RVF engine
```

**Two ways to start (both real, both in the README):**
1. **CLI, no code:**
   ```
   npm install agenticow
   agenticow init   mem.rvf --dim 128
   agenticow ingest mem.rvf --n 5000
   agenticow branch mem.rvf --as user-42        # cheap per-user personalization
   agenticow query  mem.rvf.user-42.rvf --k 10  # top-K read-through (masked, reranked)
   agenticow diff   mem.rvf.user-42.rvf         # added / overridden / tombstoned ids
   agenticow demo                               # scripted end-to-end walkthrough
   ```
2. **In your own JS (README "Quick start"):**
   ```js
   import { open } from 'agenticow';
   const base  = open('memory.rvf', { dimension: 1536 });
   base.ingest([{ id: 1, vector: embedding }, /* ... */]);
   const agent = base.branch('agent-a');        // ~0.5 ms / 162 B, any base size
   agent.ingest([{ id: 9001, vector: newMemory }]);
   const hits  = agent.query(queryVector, 10);  // -> [{ id, distance, branch }, ...]
   const ckpt  = agent.checkpoint('clean');
   agent.ingest([{ id: 666, vector: poison }]);
   agent.rollback(ckpt.id);                      // poison gone, clean memory intact
   ```

## 'Why this vs what I already have?' — the differentiation
A reader may already use Pinecone / Chroma / pgvector / hnswlib, or reach for Git-style snapshots. Answer head-on:

- **vs a normal vector DB (Pinecone, Chroma, pgvector, hnswlib):** those are built to search *one* index fast. To get a *second isolated version* you **full-copy** the index. agenticow keeps the search "good enough" and makes **branching** the cheap primitive: *162 bytes / 0.47 ms* per fork vs *496 MB / 67 ms*. Different job — it's a *branching layer*, often used **on top of** an engine, not a replacement search engine.
- **The honest trade it names itself:** *"It **concedes raw single-index ANN throughput** to dedicated vector DBs — ~**6.3× behind** a dedicated flat-index engine like hnswlib at 1M-vector scale… It's a **deliberate trade**."* (SIFT-1M measured, recall@10 ≈ 0.97, per the latest commit.) *"If you need maximum raw similarity-search speed on a static index, use a dedicated ANN library."*
- **vs "just snapshot it yourself":** a snapshot is still a whole copy. agenticow's branches are copy-on-write *and* queryable live (read-through merge with child-wins + tombstone masking), diff-able (`{ added, overridden, deleted }`), and merge-able (`promote`). It's version control, not backups.
- **The one thing nothing else here gives you:** **constant-cost, constant-size branching of a vector memory** with Git-shaped semantics (branch / checkpoint / rollback / diff / promote / lineage). That's the moat.

## Honest limits (state plainly, don't hide — the repo is unusually candid)
All grounded in the README's own "Honest scope" / "Note on cosine" / "Applications" sections and the repo metadata.

- **Not a faster search engine.** It *"concedes raw single-index ANN throughput"* and is *"~6.3× behind hnswlib at 1M-vector scale"* — a deliberate trade, not a bug. Don't pitch it as "a faster vector DB."
- **Native cross-branch ANN is Linux-only today.** The fast `fork(..., { nativeAnn: true })` path (a *"single Rust dual-graph HNSW merge over parent ∪ child"*, *"recall@10 ≈ 1.0 (0.999)"*) ships as a native binary for **linux-x64-gnu only**; *"darwin / win / linux-arm64 are pending a CI cross-compile and **degrade gracefully to the exact read-through path**."*
- **It does not make models smarter.** *"The honest claim is leverage, not intelligence."* The cognitive *quality* of a branch is explicitly out of scope.
- **Selection must be external and deterministic.** The repo warns *against* using a cheap LM as judge: *"a verifier-gated LM-judge picks **worse** than a plain majority vote."* The promotion gate must be tests / regex / checkers, *"a scoring function, not validated AI cognition."*
- **The "exotic" applications are vision / PoC.** Parallel "selves," Darwin-style memory evolution, simulated orgs — research demos, not validated capabilities.
- **Distribution layer is roadmap, not shipped.** Agent marketplaces / shared base registries — *"the distribution, trust, and merge-policy layer is **roadmap, not shipped**."*
- **Cosine has a reopen quirk.** *"rvf-node does not persist the cosine metric across a file reopen"*; agenticow drives the engine with *"L2 over L2-normalized vectors"* for cosine (L2 order = cosine order on unit vectors). Reopen with `{ metric: 'cosine' }` or via `save()`/`load()`.
- **A real version inconsistency to surface, not hide:** the README body still says *"agenticow@0.2.1"* while `package.json` and npm are at **0.2.3** — read the version that matches what you install.
- **It is very new and small.** Created **2026-06-28**; at the pinned SHA the repo had ~2 stars, 0 forks, 0 open issues, version 0.2.3. Treat it as early-stage infrastructure.

---

### Provenance (mandatory on the page)
- **Author:** Reuven Cohen / **@ruvnet** · **License:** MIT © ruvnet.
- **Source:** <https://github.com/ruvnet/agenticow> · **Live demo:** <https://ruvnet.github.io/agenticow/> · **npm:** `agenticow` (0.2.3).
- **Built from HEAD:** `3d93dc348b88cdc7e5cb251e89219a05b11dd784` (short `3d93dc3`, branch `main`) — show a live updated-date + this sha so a visitor can tell whether it's current.
- **Built on:** ruvector RVF (`@ruvruvnet/ruvector`); runtime dependency `@ruvector/rvf-node ^0.2.0` (prebuilt native binding for linux-x64/arm64, darwin-x64/arm64, win32-x64).
- **Topics (GitHub):** agent-memory, ai-agents, checkpoint, copy-on-write, embedded-database, llm, memory, multi-agent, vector-database, vector-search.
