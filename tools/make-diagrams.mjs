#!/usr/bin/env node
// make-diagrams.mjs — Station 4 structural-SVG rung (tools/ CONTRACT.md row 4)
//
// JOB (ADR-0005 Station 4 + INV-18 + DDD §13 INV-15): produce the structural SVG rungs —
// the MANDATORY architecture diagram (grounded in the REAL kb dep-graph + symbols), the
// MANDATORY process/data-flow diagram (grounded in the REAL kb entrypoints), plus the
// big-idea and aha-insight diagrams. Author grounded ASCII → convert to crisp, accessible,
// xmllint-clean SVG via the ascii-to-svg skill's conversion rules.
//
// CONTRACT conformance:
//   • Uniform invocation:  node tools/make-diagrams.mjs <build-dir>
//   • Reads ONLY its declared slice of build.json:
//       kb.depGraphPath / kb.entrypointsPath / kb.symbolsPath  (the real extraction)
//       visuals.<key>.{ascii,altText}                          (brain-authored, when present)
//       concept.palette                                        (optional, read-only — diagram theming)
//   • Writes ONLY its own slot — visuals.architectureDiagram / .flowDiagram /
//       .bigIdeaDiagram / .insightDiagram — leaving visuals.hero / visuals.sections (the
//       generate-image tool's keys) byte-for-byte untouched. Plus the four .svg files under
//       <build-dir>/assets/.
//   • PURE: no network, no other tool's files, no whole-context read.
//   • FAIL LOUD: any failure prints {ok:false,...} to stdout AND exits non-zero with a clear
//       reason on stderr. NEVER a silent placeholder, stub, or default SVG (INV-04).
//   • Idempotent: re-running overwrites this tool's four SVGs + its slot; never appends.
//
// ASCII provenance: architecture & flow are grounded in REAL structure (INV-18) — the kb
// dep-graph / entrypoints MUST be present and non-empty or the diagram is a LOUD STOP, never
// invented. When the brain has pre-authored ASCII (visuals.<key>.ascii) it is honoured;
// otherwise this tool authors grounded ASCII from the extraction. big-idea & insight are
// judgment diagrams with no KB source — their ASCII MUST be brain-authored or the build stops.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOOL = 'make-diagrams';

/** Loud stop: failure JSON on stdout, human reason on stderr, non-zero exit. */
function die(error) {
  process.stdout.write(JSON.stringify({ ok: false, outputs: {}, error }) + '\n');
  process.stderr.write(`${TOOL}: ${error}\n`);
  process.exit(1);
}

const warn = (msg) => process.stderr.write(`${TOOL}: warning: ${msg}\n`);

function loadJson(file, label) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { die(`cannot read ${label} at ${file}: ${e.message}`); }
  try { return JSON.parse(raw); }
  catch (e) { die(`${label} at ${file} is not valid JSON: ${e.message}`); }
}

/** kb paths may be repo-root-relative (cwd) or build-dir-relative; resolve robustly. */
function resolveKbPath(p, buildDir) {
  if (!p || typeof p !== 'string') return null;
  const cands = path.isAbsolute(p)
    ? [p]
    : [path.resolve(process.cwd(), p), path.resolve(buildDir, p)];
  for (const c of cands) { if (fs.existsSync(c)) return c; }
  return null;
}

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render ASCII faithfully as a crisp, scalable, accessible monospace SVG following the
 * ascii-to-svg skill's minimal palette + mandatory root attributes + entity escaping.
 * THEME-AWARE: when the brain's concept.palette is supplied (read-only, optional) the card is
 * coloured to match the page — surface bg, ink text, ridge border, accent title — so the diagram
 * reads as a cohesive on-brand panel instead of a jarring light box. Absent a palette it falls back
 * to the neutral light card + a dark-mode media query. Vector text = maximum clarity, never slop.
 */
function asciiToSvg(ascii, { title, desc, theme }) {
  const lines = ascii.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) lines.push('');

  const FONT = 17, LINE_H = 25, CHAR_W = FONT * 0.6, PAD = 28;
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const W = Math.ceil(maxLen * CHAR_W + PAD * 2);
  const H = Math.ceil(lines.length * LINE_H + PAD * 2);

  // Theme-aware index of the first non-empty line (the diagram's own title row) → accent colour.
  let titleIdx = lines.findIndex((l) => l.trim() !== '');
  if (titleIdx < 0) titleIdx = 0;

  const textEls = lines
    .map((line, i) => {
      const y = PAD + (i + 1) * LINE_H - 5;
      const cls = i === titleIdx ? 'ln hd' : 'ln';
      return `  <text class="${cls}" x="${PAD}" y="${y}" xml:space="preserve">${escapeXml(line)}</text>`;
    })
    .join('\n');

  // Explicit on-brand theme (no media query — the colours are deliberate) when a palette is present;
  // otherwise the neutral light card with a dark-mode fallback.
  const styleBlock = theme
    ? `      .bg { fill: ${theme.bg}; stroke: ${theme.border}; stroke-width: 1.5px; }
      .ln { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: ${FONT}px; font-weight: 500; fill: ${theme.ink}; white-space: pre; }
      .hd { fill: ${theme.accent}; font-weight: 700; }`
    : `      .bg { fill: #f8f9fa; stroke: #333333; stroke-width: 1.5px; }
      .ln { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: ${FONT}px; fill: #1a1a1a; white-space: pre; }
      .hd { font-weight: 600; }
      @media (prefers-color-scheme: dark) {
        .bg { fill: #161b22; stroke: #768390; }
        .ln { fill: #e6edf3; }
      }`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="diagram-title diagram-desc">
  <title id="diagram-title">${escapeXml(title)}</title>
  <desc id="diagram-desc">${escapeXml(desc)}</desc>
  <defs>
    <style>
${styleBlock}
    </style>
  </defs>
  <rect class="bg" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10"/>
${textEls}
</svg>
`;
}

// Derive an on-brand diagram theme from the brain's concept.palette (read-only, optional). Pure map:
// surface→card bg, ink→text, ridge→border, accent→title. Returns null when no usable palette is set,
// so the renderer keeps its neutral light default for un-themed builds.
function themeFromPalette(palette) {
  if (!palette || typeof palette !== 'object') return null;
  const g = (k) => (typeof palette[k] === 'string' && palette[k].trim() ? palette[k].trim() : null);
  const bg = g('surface') || g('bg-2') || g('bg');
  const ink = g('ink');
  if (!bg || !ink) return null;
  return { bg, ink, border: g('ridge') || g('accent') || ink, accent: g('accent') || ink };
}

/** xmllint is the proof of well-formedness; its absence or a failure is a loud stop. */
function assertXmllintClean(svgPath, key) {
  try {
    execFileSync('xmllint', ['--noout', svgPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      die(`xmllint not found on PATH — cannot validate the ${key} SVG; refusing to ship an unverified diagram`);
    }
    const detail = e && e.stderr ? e.stderr.toString().trim() : (e ? e.message : 'unknown error');
    die(`SVG validation failed for ${key} (${svgPath}): ${detail}`);
  }
}

/** Match a dep-graph node to its symbol count (by crate name or manifest dir). Best-effort. */
function symbolCountFor(node, sym) {
  if (!sym || !sym.byCrate || !node) return null;
  const bc = sym.byCrate;
  const cands = [node.name];
  if (node.manifest) {
    const dir = String(node.manifest).replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    if (dir) cands.push(dir);
  }
  for (const c of cands) {
    if (c && Object.prototype.hasOwnProperty.call(bc, c) && typeof bc[c] === 'number') return bc[c];
  }
  return null;
}

/** Architecture ASCII grounded in the REAL dep-graph (+ symbols). Layered by dependency role. */
function deriveArchitectureAscii(dg, sym, name) {
  const nodes = Array.isArray(dg.nodes) ? dg.nodes : [];
  const edges = Array.isArray(dg.internalEdges) ? dg.internalEdges : [];
  const inDeg = {}, outDeg = {};
  for (const e of edges) {
    if (!e || !e.to || !e.from) continue;
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
    outDeg[e.from] = (outDeg[e.from] || 0) + 1;
  }
  const ecos = (Array.isArray(dg.ecosystems) ? dg.ecosystems : []).join(', ') || 'n/a';
  const symAnn = (n) => { const k = symbolCountFor(n, sym); return k != null ? ` | ${k} symbols` : ''; };

  const lines = [
    `${name} - Architecture`,
    `${dg.componentCount ?? nodes.length} components | ${dg.internalEdgeCount ?? edges.length} internal deps | ecosystems: ${ecos}`,
    '',
  ];

  if (edges.length === 0) {
    // Single / independent components (e.g. a one-package repo): no internal graph to layer.
    lines.push('COMPONENTS (no internal dependencies between them)');
    for (const n of nodes.slice(0, 8)) lines.push(`  - ${n.name}${symAnn(n)}`);
    if (nodes.length > 8) lines.push(`  ... +${nodes.length - 8} more`);
  } else {
    const apps = nodes
      .filter((n) => (inDeg[n.name] || 0) === 0 && (outDeg[n.name] || 0) > 0)
      .sort((a, b) => (outDeg[b.name] || 0) - (outDeg[a.name] || 0)).slice(0, 5);
    const core = nodes
      .filter((n) => (inDeg[n.name] || 0) > 0 && (outDeg[n.name] || 0) > 0)
      .sort((a, b) => (inDeg[b.name] || 0) - (inDeg[a.name] || 0)).slice(0, 5);
    const found = nodes
      .filter((n) => (outDeg[n.name] || 0) === 0 && (inDeg[n.name] || 0) > 0)
      .sort((a, b) => (inDeg[b.name] || 0) - (inDeg[a.name] || 0)).slice(0, 5);
    const standalone = nodes.filter((n) => (inDeg[n.name] || 0) === 0 && (outDeg[n.name] || 0) === 0);

    const band = (label, list, fmt) => {
      const out = [label];
      if (list.length === 0) out.push('  (none)');
      else for (const n of list) out.push('  - ' + fmt(n));
      return out;
    };

    lines.push(...band('APPS / ENTRY POINTS (nothing internal depends on them)', apps,
      (n) => `${n.name}  uses ${outDeg[n.name] || 0} internal`));
    lines.push('        |', '        v  depend on');
    lines.push(...band('CORE MODULES (most depended-on)', core,
      (n) => `${n.name}  ${inDeg[n.name] || 0} dependents${symAnn(n)}`));
    lines.push('        |', '        v  build on');
    lines.push(...band('FOUNDATION (no internal dependencies)', found,
      (n) => `${n.name}  ${inDeg[n.name] || 0} dependents${symAnn(n)}`));
    if (standalone.length) {
      const shown = standalone.slice(0, 6).map((n) => n.name).join(', ');
      lines.push('', `STANDALONE: ${shown}${standalone.length > 6 ? ` (+${standalone.length - 6})` : ''}`);
    }
  }

  const ext = Array.isArray(dg.externalDepNames) ? dg.externalDepNames : [];
  if (ext.length) {
    lines.push('', `external deps (${dg.externalDepCount ?? ext.length}): ${ext.slice(0, 6).join(', ')}${ext.length > 6 ? ` (+${ext.length - 6})` : ''}`);
  }
  return lines.join('\n');
}

/** Process / data-flow ASCII grounded in the REAL entrypoints (install -> build -> run -> verify). */
function deriveFlowAscii(ep, name) {
  const ws = ep.workspace || {};
  const members = Array.isArray(ws.members) ? ws.members.length : 0;
  const pick = (cat) => { const c = (Array.isArray(ep.commands) ? ep.commands : []).find((x) => x && x.category === cat); return c ? c.cmd : null; };
  const binNames = (Array.isArray(ep.binaries) ? ep.binaries : []).map((b) => b && b.name).filter(Boolean);

  const installCmd = (Array.isArray(ep.install) && ep.install[0]) || pick('install');
  const buildCmd = pick('build');
  const runCmd = binNames[0] || pick('run') || (Array.isArray(ep.quickstart) && ep.quickstart[0]) || null;
  const testCmd = pick('test');

  const steps = [];
  if (installCmd) steps.push(['Install', installCmd, '']);
  if (buildCmd) steps.push(['Build', buildCmd, '']);
  if (runCmd) steps.push(['Run', runCmd, binNames.length ? `entry: ${binNames.slice(0, 4).join(', ')}` : '']);
  if (testCmd) steps.push(['Verify', testCmd, '']);
  if (steps.length === 0 && Array.isArray(ep.quickstart) && ep.quickstart[0]) {
    steps.push(['Run', ep.quickstart[0], '']);
  }

  const lines = [
    `${name} - Process / Data Flow`,
    `workspace: ${ws.kind || 'n/a'}${members ? ` (${members} members)` : ''}`,
    '',
  ];
  steps.forEach((s, i) => {
    const [label, cmd, note] = s;
    lines.push(`  [${i + 1}] ${label.padEnd(8)} ->  ${cmd}${note ? `    (${note})` : ''}`);
    if (i < steps.length - 1) { lines.push('         |'); lines.push('         v'); }
  });
  const qs = (Array.isArray(ep.quickstart) ? ep.quickstart : []).slice(0, 3);
  if (qs.length) { lines.push('', `quickstart: ${qs.join('  |  ')}`); }
  return lines.join('\n');
}

function firstNonEmptyLine(ascii) {
  for (const l of ascii.split('\n')) { const t = l.trim(); if (t) return t; }
  return '';
}

function defaultAltText(spec, dg, ep, name, ascii) {
  if (spec.grounded === 'architecture') {
    const ecos = (Array.isArray(dg.ecosystems) ? dg.ecosystems : []).join('/') || 'one ecosystem';
    return `${name} architecture diagram: ${dg.componentCount ?? (Array.isArray(dg.nodes) ? dg.nodes.length : 0)} components across ${ecos}, ${dg.internalEdgeCount ?? 0} internal dependencies — apps depend on core modules which build on foundation libraries.`;
  }
  if (spec.grounded === 'flow') {
    const bins = (Array.isArray(ep.binaries) ? ep.binaries : []).map((b) => b && b.name).filter(Boolean).slice(0, 3).join(', ');
    return `${name} process and data-flow diagram: install, build, run the entry point(s)${bins ? ` (${bins})` : ''}, then verify — the runtime sequence derived from the project's entrypoints.`;
  }
  return `${spec.title} diagram for ${name}: ${firstNonEmptyLine(ascii) || spec.title}`;
}

// ── The four structural rungs (visuals slot sub-keys). grounded => requires real KB source. ──
const DIAGRAMS = [
  { key: 'architectureDiagram', file: 'architecture.svg', title: 'Architecture',        grounded: 'architecture' },
  { key: 'flowDiagram',         file: 'flow.svg',         title: 'Process / Data Flow', grounded: 'flow' },
  { key: 'bigIdeaDiagram',      file: 'big-idea.svg',     title: 'Big Idea',            grounded: null },
  { key: 'insightDiagram',      file: 'insight.svg',      title: 'The Insight',         grounded: null },
];

function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 1 || !argv[0]) die('usage: node tools/make-diagrams.mjs <build-dir>');
  const buildDir = path.resolve(argv[0]);
  if (!fs.existsSync(buildDir) || !fs.statSync(buildDir).isDirectory()) {
    die(`build directory does not exist: ${buildDir}`);
  }

  const buildJsonPath = path.join(buildDir, 'build.json');
  if (!fs.existsSync(buildJsonPath)) die(`build.json not found in build dir: ${buildJsonPath}`);
  const buildJson = loadJson(buildJsonPath, 'build.json');

  const kb = buildJson.kb;
  if (!kb || typeof kb !== 'object') die("build.json is missing the 'kb' slot (Station 1 must run before Station 4)");

  // ── Grounding preconditions: architecture & flow are REAL structure or a loud stop (INV-18). ──
  const dgPath = resolveKbPath(kb.depGraphPath, buildDir);
  if (!dgPath) die(`architecture diagram cannot be produced: kb.depGraphPath not found (${kb.depGraphPath ?? 'unset'}) — refusing to invent module structure`);
  const dg = loadJson(dgPath, 'dep-graph');
  if (!Array.isArray(dg.nodes) || dg.nodes.length === 0) {
    die(`architecture diagram cannot be produced: dep-graph has no nodes (${dgPath})`);
  }

  const epPath = resolveKbPath(kb.entrypointsPath, buildDir);
  if (!epPath) die(`flow diagram cannot be produced: kb.entrypointsPath not found (${kb.entrypointsPath ?? 'unset'}) — refusing to invent runtime flow`);
  const ep = loadJson(epPath, 'entrypoints');
  const hasFlow =
    (Array.isArray(ep.install) && ep.install.length) ||
    (Array.isArray(ep.commands) && ep.commands.length) ||
    (Array.isArray(ep.binaries) && ep.binaries.length) ||
    (Array.isArray(ep.quickstart) && ep.quickstart.length);
  if (!hasFlow) die(`flow diagram cannot be produced: entrypoints has no install/commands/binaries/quickstart (${epPath})`);

  // symbols enriches the architecture diagram — best-effort (warn, don't sink the build).
  const symPath = resolveKbPath(kb.symbolsPath, buildDir);
  let sym = null;
  if (symPath) sym = loadJson(symPath, 'symbols');
  else warn(`kb.symbolsPath not found (${kb.symbolsPath ?? 'unset'}) — architecture diagram will omit symbol counts`);

  const name =
    (buildJson.understanding && buildJson.understanding.repoName) ||
    (buildJson.repo && buildJson.repo.name) ||
    dg.metaName || ep.metaName || dg.target || 'this repo';

  // Optional read-only theming input: the brain's concept.palette (Station 2). When present, the
  // structural SVGs are coloured to match the page; absent it, they keep the neutral light default.
  const diagramTheme = themeFromPalette(buildJson.concept && buildJson.concept.palette);
  if (diagramTheme) process.stderr.write(`${TOOL}: theming diagrams from concept.palette (bg ${diagramTheme.bg}, ink ${diagramTheme.ink})\n`);

  const assetsDir = path.join(buildDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const visualsIn = (buildJson.visuals && typeof buildJson.visuals === 'object') ? buildJson.visuals : {};
  const merged = {};

  for (const spec of DIAGRAMS) {
    const existing = (visualsIn[spec.key] && typeof visualsIn[spec.key] === 'object') ? visualsIn[spec.key] : {};

    let ascii = (typeof existing.ascii === 'string' && existing.ascii.trim()) ? existing.ascii : null;
    if (!ascii) {
      if (spec.grounded === 'architecture') ascii = deriveArchitectureAscii(dg, sym, name);
      else if (spec.grounded === 'flow') ascii = deriveFlowAscii(ep, name);
      else die(`missing brain-authored ASCII for ${spec.key}: ${spec.title} is a judgment diagram with no KB source to derive from — the brain must author visuals.${spec.key}.ascii`);
    }

    const altText = (typeof existing.altText === 'string' && existing.altText.trim())
      ? existing.altText
      : defaultAltText(spec, dg, ep, name, ascii);

    const svg = asciiToSvg(ascii, { title: `${name} - ${spec.title}`, desc: altText, theme: diagramTheme });
    const svgPath = path.join(assetsDir, spec.file);
    fs.writeFileSync(svgPath, svg, 'utf8');
    assertXmllintClean(svgPath, spec.key);

    merged[spec.key] = { ascii, svgPath, altText, xmllintOK: true };
  }

  // Merge ONLY our four sub-keys; preserve visuals.hero / visuals.sections (generate-image's keys).
  buildJson.visuals = { ...visualsIn, ...merged };
  fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2) + '\n', 'utf8');

  const outputs = {
    slot: 'visuals',
    mergedKeys: DIAGRAMS.map((d) => d.key),
    svgPaths: Object.fromEntries(DIAGRAMS.map((d) => [d.key, merged[d.key].svgPath])),
    groundedIn: { architecture: dgPath, flow: epPath, symbols: symPath || null },
  };
  process.stdout.write(JSON.stringify({ ok: true, outputs, error: null }) + '\n');
  process.exit(0);
}

main();
