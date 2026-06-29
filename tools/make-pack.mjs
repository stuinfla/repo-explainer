#!/usr/bin/env node
// make-pack.mjs — Station 6 (ASSEMBLE + PACK): build the downloadable AI knowledge pack.
//
// This is the STUDIO-LESS variant of kb/make-dropin.mjs — the ONE acknowledged change to the
// otherwise-reused kb/ engine (ADR-0005 D3 / Station 6 / INV-07). make-dropin.mjs carries a hard
// D13/V guard (its lines 78–92) that THROWS "Refusing to build a studio-less drop-in" unless
// for-humans/studio/ already holds both an audio overview AND a *report.md. Because the explainer
// ships studio-less first (INV-03), this tool ports make-dropin's proven packing layout but RELAXES
// that guard to optional: studio media rides in the zip when present, and is simply absent otherwise.
//
// CONTRACT (tools/CONTRACT.md):
//   invocation : node tools/make-pack.mjs <build-dir>          (one positional arg — the build dir)
//   reads      : <build-dir>/build.json → kb slot + repo.slug  (ONLY its declared slice)
//   writes     : <build-dir>/site/<slug>-knowledge-pack.zip    (the zip)
//                merges ONLY the `pack` slot back into build.json
//   stdout     : EXACTLY one JSON result object — { ok, outputs, error } — nothing else
//   stderr     : all diagnostics
//   exit code  : 0 iff ok:true; any failure → non-zero + a clear message (never a silent placeholder)
//
// Fail-loud postconditions (INV-04, Never-Fail-Silently):
//   - a missing required for-ai/for-humans input is a loud stop (the ported make-dropin must() checks)
//   - an EMPTY pack (no passage text, or a zero-byte .rvf) is a loud stop — the pack would be useless
//   - a zip that does not open / is missing the KB artifacts is a loud stop (never a silent green)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url)); // tools/
const ROOT = path.resolve(TOOL_DIR, '..');                     // repo root
const KB_DIR = path.join(ROOT, 'kb');                          // the reused engine

// Diagnostics → stderr ONLY (stdout is reserved for the single JSON result object).
const log = (...a) => console.error(...a);

// Resolve a build.json path (which may be repo-relative like "kb/stores/<slug>/…") against ROOT.
const resolveFromRoot = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT, p));
function must(p) { if (!fs.existsSync(p)) throw new Error(`missing required input: ${p}`); return p; }

function readLastBuilt() {
  try { return JSON.parse(fs.readFileSync(path.join(KB_DIR, '.last-built.json'), 'utf8')); }
  catch { return {}; }
}

// Count non-empty lines without slurping assumptions about size — the empty-pack signal.
function countPassages(passagesPath) {
  const raw = fs.readFileSync(passagesPath, 'utf8');
  return raw.split('\n').filter((l) => l.trim().length > 0).length;
}

function build(buildDir) {
  const buildRoot = path.resolve(buildDir);
  const buildJsonPath = path.join(buildRoot, 'build.json');
  must(buildJsonPath);
  const ctx = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));

  // ---- take ONLY the declared slice: kb slot + repo.slug ----
  const slug = ctx?.repo?.slug;
  const kb = ctx?.kb;
  if (!slug) throw new Error('build.json: repo.slug is required (Station 0–1 must have run)');
  if (!kb || !kb.storeDir) throw new Error('build.json: kb.storeDir is required (Station 1 must have run)');

  const storeDir = resolveFromRoot(kb.storeDir);
  must(storeDir);
  const studioDir = path.join(storeDir, 'studio', 'for-humans');

  // ---- for-ai/ KB core (required) — ported from make-dropin.mjs FOR_AI ----
  const FOR_AI = [
    [`${slug}-kb.rvf`, `for-ai/${slug}-kb.rvf`],
    [`${slug}-kb.rvf.idmap.json`, `for-ai/${slug}-kb.rvf.idmap.json`],
    [`${slug}-kb.rvf.embed.json`, `for-ai/${slug}-kb.rvf.embed.json`],
    [`${slug}-kb.passages.jsonl`, `for-ai/${slug}-kb.passages.jsonl`],
    [`${slug}-kb.ids.json`, `for-ai/${slug}-kb.ids.json`],
  ].map(([f, dst]) => [path.join(storeDir, f), dst]);

  // ---- for-ai/ structured indexes — what 3 of the 4 MCP tools read (lookup_symbol / get_dep_graph /
  // get_entrypoints). Shipped if present; their absence is not fatal here (a JSON-light build is still
  // a valid drop-in), but the Station-6 cue grades them — so we record exactly which shipped. ----
  const FOR_AI_STRUCTURED = [
    [`${slug}-symbols.json`, `for-ai/${slug}-symbols.json`],
    [`${slug}-dep-graph.json`, `for-ai/${slug}-dep-graph.json`],
    [`${slug}-entrypoints.json`, `for-ai/${slug}-entrypoints.json`],
  ].map(([f, dst]) => [path.join(storeDir, f), dst]).filter(([src]) => fs.existsSync(src));

  // ---- for-ai/ tools — the in-repo kb/ engine the pack ships (NOT @ruvector/rvf-mcp-server) ----
  const FOR_AI_TOOLS = [
    ['ask-kb.mjs', 'for-ai/ask-kb.mjs'],
    ['kb-mcp-server.mjs', 'for-ai/kb-mcp-server.mjs'],
    ['kb.config.mjs', 'for-ai/kb.config.mjs'],
    ['resolve-deps.mjs', 'for-ai/resolve-deps.mjs'],
  ].map(([f, dst]) => [path.join(KB_DIR, f), dst]);

  // ---- for-humans/ primer (required deliverable — make-dropin line-79 must()) ----
  const primerSrc = must(path.join(storeDir, `${slug}-primer.md`));

  // ---- EMPTY-PACK GUARD (fail loud) — the pack's whole point is a loadable, searchable KB. ----
  const rvfSrc = must(FOR_AI[0][0]);            // <slug>-kb.rvf
  const passagesSrc = must(FOR_AI[3][0]);       // <slug>-kb.passages.jsonl
  if (fs.statSync(rvfSrc).size === 0) {
    throw new Error(`empty pack: ${path.relative(ROOT, rvfSrc)} is zero bytes — no vectors to ship`);
  }
  const passageCount = countPassages(passagesSrc);
  if (passageCount === 0) {
    throw new Error(`empty pack: ${path.relative(ROOT, passagesSrc)} has no passages — search would return nothing`);
  }
  // verify every other required for-ai file is present BEFORE we stage anything
  for (const [src] of [...FOR_AI, ...FOR_AI_TOOLS]) must(src);

  // ---- studio (OPTIONAL — relaxed D13/V guard; the studio-less change) ----
  const studioFiles = fs.existsSync(studioDir)
    ? fs.readdirSync(studioDir)
        .filter((f) => !f.startsWith('.') && f !== 'studio-links.json')
        .map((f) => [path.join(studioDir, f), `for-humans/studio/${f}`])
    : [];
  let studioLinks = {};
  try { studioLinks = JSON.parse(fs.readFileSync(path.join(studioDir, 'studio-links.json'), 'utf8')); }
  catch { /* optional */ }
  const audioEntry = studioFiles.find(([, d]) => /\.(m4a|mp3|wav)$/i.test(d));
  const reportEntry = studioFiles.find(([, d]) => /report\.md$/i.test(d));

  // ---- for-ai/package.json (drop-in runnable) — ported from make-dropin ----
  const forAiPkg = {
    name: `${slug}-dropin-kb`,
    version: '0.1.0',
    private: true,
    type: 'module',
    description: `${slug} drop-in knowledge pack — single 384-dim RVF knowledge base + structured symbol/dep/entrypoint index + MCP server (search_kb · lookup_symbol · get_entrypoints · get_dep_graph). Run \`npm i\` then \`node ask-kb.mjs ${slug} "your question"\` or \`node ask-kb.mjs ${slug} --symbol <name>\`.`,
    scripts: { ask: `node ask-kb.mjs ${slug}`, mcp: 'node kb-mcp-server.mjs' },
    dependencies: { '@ruvector/rvf': '^0.2.2', '@xenova/transformers': '^2.17.2' },
    engines: { node: '>=18' },
  };

  // ---- manifest.json ----
  const lb = readLastBuilt();
  const manifest = {
    name: `${slug}-dropin`,
    version: lb.version || 'v0.1.1',
    builtAt: lb.builtAt || new Date().toISOString().slice(0, 10),
    sha: lb.targetRepoSha || lb.sha || null,
    embedder: kb.embedModel || 'Xenova/bge-small-en-v1.5 (384-dim, single variant, recipe v1.3.1)',
    gateA: lb.gateA || { passed: true },
    passageCount,
    contents: {
      'for-ai': [...FOR_AI, ...FOR_AI_STRUCTURED, ...FOR_AI_TOOLS]
        .map(([, d]) => d.replace('for-ai/', '')).concat(['package.json']),
      'for-humans': [`${slug}-primer.md`, ...studioFiles.map(([, d]) => d.replace('for-humans/', ''))],
    },
    structured: {
      symbols: FOR_AI_STRUCTURED.some(([, d]) => d.endsWith('-symbols.json')) ? `${slug}-symbols.json` : null,
      depGraph: FOR_AI_STRUCTURED.some(([, d]) => d.endsWith('-dep-graph.json')) ? `${slug}-dep-graph.json` : null,
      entrypoints: FOR_AI_STRUCTURED.some(([, d]) => d.endsWith('-entrypoints.json')) ? `${slug}-entrypoints.json` : null,
      note: 'Exact symbol/dependency/entrypoint lookups (AI-comprehension recipe). Use alongside ask-kb semantic search.',
    },
    studio: studioFiles.length
      ? {
          audio: audioEntry?.[1] || null,
          report: reportEntry?.[1] || null,
          notebookUrl: studioLinks.notebookUrl || null,
          videoUrl: studioLinks.videoUrl || null,
          note: 'NotebookLM media pack rides inside for-humans/studio/.',
        }
      : { note: 'Studio-less build (INV-03): the core pack ships now; NotebookLM media follows up later if produced.' },
    description: `${slug} drop-in knowledge pack. Unzip, npm i in for-ai/, point .mcp.json at kb-mcp-server.mjs, add CLAUDE.md gate. See README.md.`,
  };

  // ---- README.md ----
  const studioBlock = studioFiles.length
    ? `## Studio (NotebookLM)
The for-humans/studio/ media rides **inside** this zip${audioEntry ? ` — start with the audio: \`for-humans/studio/${path.basename(audioEntry[1])}\`` : ''}.
${studioLinks.notebookUrl ? `\n- **Open the full NotebookLM studio (public):** ${studioLinks.notebookUrl}` : ''}${studioLinks.videoUrl ? `\n- **Watch the video overview:** ${studioLinks.videoUrl}` : ''}
`
    : `## Studio (NotebookLM)
This is a **studio-less** build (INV-03): the searchable AI pack ships now; NotebookLM audio/report
media follow up later if produced. Nothing here depends on them.
`;

  const readme = `# ${slug} Drop-in

One zip. Two halves: a for-humans primer and a for-ai searchable knowledge base.

## What's inside

\`\`\`
${slug}-dropin/
  for-humans/   — read first
    ${slug}-primer.md         — top-down orientation: what it is, why, how it works
  for-ai/       — the searchable knowledge pack (wire this into your agent)
    ${slug}-kb.rvf            — single 384-dim bge-small vector DB (the "brain")
    ${slug}-kb.passages.jsonl — full passage text (${passageCount} passages; search returns TEXT, not {id,distance})
    ${slug}-kb.ids.json       — id → passage index
    ${slug}-symbols.json      — exact public API: every symbol + signature + doc + location
    ${slug}-dep-graph.json    — component dependency graph (what depends on what)
    ${slug}-entrypoints.json  — build/test/run/install commands + binaries
    ask-kb.mjs · kb-mcp-server.mjs · kb.config.mjs · resolve-deps.mjs · package.json
  README.md     — this file
  manifest.json — build metadata
\`\`\`

${studioBlock}
## Three steps to wire the AI half in
\`\`\`bash
# 1 — unzip + install (two deps, Node 18+)
unzip ${slug}-knowledge-pack.zip && cd ${slug}-dropin/for-ai && npm install

# 2 — ask the brain a question straight away
node ask-kb.mjs ${slug} "what does ${slug} actually do"

# 3 — point your AI host at it with a .mcp.json in your project root:
#   { "mcpServers": { "${slug}-kb": { "command": "node", "args": ["for-ai/kb-mcp-server.mjs"] } } }
\`\`\`

Built with the Repo-Primer recipe (ADR-0001 / ADR-0005). Embedder: ${manifest.embedder}.
`;

  // ---- stage + zip (into <build-dir>/site/) ----
  const siteDir = path.join(buildRoot, 'site');
  fs.mkdirSync(siteDir, { recursive: true });
  const OUT = path.join(siteDir, `${slug}-knowledge-pack.zip`);

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), `pack-${slug}-`));
  const copy = (src, dst) => {
    const d = path.join(stage, dst);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(src, d);
  };
  try {
    for (const [src, dst] of [...FOR_AI, ...FOR_AI_STRUCTURED, ...FOR_AI_TOOLS]) copy(src, dst);
    copy(primerSrc, `for-humans/${slug}-primer.md`);
    for (const [src, dst] of studioFiles) copy(src, dst);
    fs.writeFileSync(path.join(stage, 'for-ai/package.json'), JSON.stringify(forAiPkg, null, 2) + '\n');
    fs.writeFileSync(path.join(stage, 'README.md'), readme);
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    fs.rmSync(OUT, { force: true });
    // zip's progress goes to stderr (NOT stdout — stdout is the JSON result channel).
    execFileSync('zip', ['-r', '-X', OUT, '.'], { cwd: stage, stdio: ['ignore', process.stderr, process.stderr] });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }

  // ---- verify the pack OPENS and carries the KB artifacts (loud-fail postcondition, never a silent green) ----
  let listing = '';
  try { listing = execFileSync('unzip', ['-l', OUT], { encoding: 'utf8' }); }
  catch (e) { throw new Error(`pack does not open: unzip -l failed on ${path.relative(ROOT, OUT)} (${e.message})`); }
  const requiredEntries = [
    `for-ai/${slug}-kb.rvf`,
    `for-ai/${slug}-kb.passages.jsonl`,
    `for-ai/ask-kb.mjs`,
    `for-ai/kb-mcp-server.mjs`,
    `for-humans/${slug}-primer.md`,
  ];
  const missingInZip = requiredEntries.filter((e) => !listing.includes(e));
  if (missingInZip.length) {
    throw new Error(`pack is missing required entries after zip: ${missingInZip.join(', ')}`);
  }

  const forAiNames = [...FOR_AI, ...FOR_AI_STRUCTURED, ...FOR_AI_TOOLS]
    .map(([, d]) => d.replace('for-ai/', '')).concat(['package.json']);
  const forHumansNames = [`${slug}-primer.md`, ...studioFiles.map(([, d]) => d.replace('for-humans/', ''))];

  // ---- merge ONLY the `pack` slot back into build.json ----
  const pack = {
    zipPath: OUT,
    forAi: forAiNames,
    forHumans: forHumansNames,
    opens: true,      // verified: unzip -l succeeded and every required entry is present
    kbLoads: true,    // verified: non-zero .rvf + .passages (>0) shipped — the KB's load prerequisites
  };
  ctx.pack = pack;
  fs.writeFileSync(buildJsonPath, JSON.stringify(ctx, null, 2) + '\n');

  const sizeMb = (fs.statSync(OUT).size / 1e6).toFixed(2);
  log(`built ${path.relative(ROOT, OUT)} (${sizeMb} MB) — ${passageCount} passages, ${forAiNames.length} for-ai files`);

  return { zipPath: OUT, pack, passageCount, sizeMb };
}

// ---- uniform invocation + return convention ----
function main() {
  const buildDir = process.argv[2];
  if (!buildDir) throw new Error('usage: node tools/make-pack.mjs <build-dir>');
  return build(buildDir);
}

try {
  const outputs = main();
  process.stdout.write(JSON.stringify({ ok: true, outputs, error: null }) + '\n');
  process.exit(0);
} catch (err) {
  process.stdout.write(JSON.stringify({ ok: false, outputs: {}, error: err.message }) + '\n');
  log(err.stack || err.message);
  process.exit(1);
}
