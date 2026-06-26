#!/usr/bin/env node
// phase2-build-kb.mjs -- Standalone repo analysis for the KB content-authoring phase.
// Walks a cloned repo, extracts structure + metadata + key content, writes JSON.
// Usage: node scripts/phase2-build-kb.mjs <repo-dir> <output-dir>
// Zero npm dependencies -- Node.js built-ins only (fs, path).

import fs from 'node:fs';
import path from 'node:path';

const EXCLUDE = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'coverage', 'vendor',
  '.next', '.vite', 'pkg', '__pycache__', '.mypy_cache', '.pytest_cache',
  '.tox', 'venv', '.venv', 'env',
]);
const SRC_EXT = new Set([
  '.js', '.mjs', '.ts', '.tsx', '.py', '.rs', '.go',
  '.java', '.rb', '.swift', '.c', '.cpp', '.h',
]);
const DOC_EXT = new Set(['.md', '.txt']);
const MANIFESTS = new Set([
  'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
  'Gemfile', 'build.gradle', 'pom.xml', 'Package.swift',
]);
const MAX_LINES = 200;
const MAX_DEPTH = 3;

// ── CLI ─────────────────────────────────────────────────────────────────────
const [repoDir, outputDir] = process.argv.slice(2);
if (!repoDir || !outputDir) {
  console.error('Usage: node scripts/phase2-build-kb.mjs <repo-dir> <output-dir>');
  process.exit(1);
}
const absRepo = path.resolve(repoDir);
const absOut = path.resolve(outputDir);
if (!fs.existsSync(absRepo) || !fs.statSync(absRepo).isDirectory()) {
  console.error(`Error: repo dir not found: ${absRepo}`);
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function* walk(dir, rel = '') {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const cr = rel ? `${rel}/${e.name}` : e.name;
    const ca = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE.has(e.name) || e.name.startsWith('.')) continue;
      yield { rel: cr, abs: ca, isDir: true };
      yield* walk(ca, cr);
    } else {
      yield { rel: cr, abs: ca, isDir: false };
    }
  }
}

function buildTree(dir, depth = 0) {
  if (depth >= MAX_DEPTH) return null;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  const node = { dirs: [], files: [] };
  for (const e of ents) {
    if (e.isDirectory()) {
      if (EXCLUDE.has(e.name) || e.name.startsWith('.')) continue;
      node.dirs.push({ name: e.name, children: buildTree(path.join(dir, e.name), depth + 1) });
    } else node.files.push(e.name);
  }
  return node;
}

function safe(fp) { try { return fs.readFileSync(fp, 'utf8'); } catch { return null; } }

function headLines(fp, n) {
  const c = safe(fp);
  if (!c) return null;
  const lines = c.split('\n');
  return { content: lines.slice(0, n).join('\n'), totalLines: lines.length, truncated: lines.length > n };
}

// Symbol extraction -- table-driven patterns per language group
const SYM_RULES = {
  js:   [[/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, 'functions'],
         [/^(?:export\s+)?class\s+(\w+)/, 'classes'],
         [/^(?:export\s+)?(?:interface|type|enum)\s+(\w+)/, 'types'],
         [/^export\s+(?:default\s+)?(?:const|let|var)\s+(\w+)/, 'exports']],
  py:   [[/^(?:async\s+)?def\s+(\w+)/, 'functions'], [/^class\s+(\w+)/, 'classes']],
  rs:   [[/^pub(?:\(crate\))?\s+(?:async\s+)?fn\s+(\w+)/, 'functions'],
         [/^(?:pub(?:\(crate\))?\s+)?(?:struct|enum)\s+(\w+)/, 'types'],
         [/^(?:pub(?:\(crate\))?\s+)?trait\s+(\w+)/, 'types'],
         [/^(?:pub(?:\(crate\))?\s+)?impl(?:<[^>]*>)?\s+(\w+)/, 'classes']],
  go:   [[/^func\s+(?:\([^)]+\)\s+)?(\w+)/, 'functions'],
         [/^type\s+(\w+)\s+(?:struct|interface)/, 'types']],
  java: [[/(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/, 'functions'],
         [/(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/, 'classes'],
         [/(?:public\s+)?interface\s+(\w+)/, 'types']],
  c:    [[/^(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{?\s*$/, 'functions'],
         [/^(?:class|struct)\s+(\w+)/, 'types']],
  rb:   [[/^def\s+(\w+)/, 'functions'], [/^class\s+(\w+)/, 'classes'],
         [/^module\s+(\w+)/, 'types']],
  sw:   [[/^(?:public\s+)?func\s+(\w+)/, 'functions'],
         [/^(?:public\s+)?(?:class|struct|enum|protocol)\s+(\w+)/, 'types']],
};
const EXT_LANG = { '.js':'js', '.mjs':'js', '.ts':'js', '.tsx':'js', '.py':'py', '.rs':'rs',
  '.go':'go', '.java':'java', '.c':'c', '.cpp':'c', '.h':'c', '.rb':'rb', '.swift':'sw' };

function extractSymbols(text, ext) {
  const rules = SYM_RULES[EXT_LANG[ext]];
  if (!rules) return null;
  const sym = { functions: [], classes: [], types: [], exports: [] };
  for (const line of text.split('\n')) {
    const t = line.trim();
    for (const [re, bucket] of rules) { const m = t.match(re); if (m) sym[bucket].push(m[1]); }
  }
  for (const k of Object.keys(sym)) sym[k] = [...new Set(sym[k])];
  return Object.values(sym).some(a => a.length) ? sym : null;
}

const LANG_MAP = { '.ts':'TypeScript', '.tsx':'TypeScript', '.js':'JavaScript', '.mjs':'JavaScript',
  '.py':'Python', '.rs':'Rust', '.go':'Go', '.java':'Java',
  '.rb':'Ruby', '.swift':'Swift', '.c':'C', '.cpp':'C++', '.h':'C/C++' };

function detectLanguage(files) {
  const c = {};
  for (const f of files) { const e = path.extname(f.rel).toLowerCase(); if (SRC_EXT.has(e)) c[e] = (c[e]||0)+1; }
  const top = Object.entries(c).sort((a,b) => b[1]-a[1]);
  return top.length ? (LANG_MAP[top[0][0]] || 'Unknown') : 'Unknown';
}

// Manifest parsing -- lightweight regex for TOML/mod, JSON.parse for package.json
function parseManifest(name, raw) {
  if (name === 'package.json') {
    try {
      const p = JSON.parse(raw);
      return { name: p.name||null, description: p.description||null, version: p.version||null,
        dependencies: Object.keys(p.dependencies||{}), devDependencies: Object.keys(p.devDependencies||{}),
        scripts: Object.keys(p.scripts||{}), main: p.main||p.module||null, keywords: p.keywords||[] };
    } catch { return null; }
  }
  const rx = (pat) => { const m = raw.match(pat); return m ? m[1] : null; };
  if (name === 'Cargo.toml') {
    const meta = { name: rx(/^name\s*=\s*"([^"]+)"/m), description: rx(/^description\s*=\s*"([^"]+)"/m),
      version: rx(/^version\s*=\s*"([^"]+)"/m) };
    const d = raw.match(/\[dependencies\]([\s\S]*?)(?=\n\[|\n*$)/);
    if (d) meta.dependencies = [...d[1].matchAll(/^(\w[\w-]*)\s*=/gm)].map(x => x[1]);
    const k = rx(/^keywords\s*=\s*\[([^\]]*)\]/m);
    if (k) meta.keywords = [...k.matchAll(/"([^"]+)"/g)].map(x => x[1]);
    return meta;
  }
  if (name === 'pyproject.toml') {
    const meta = { name: rx(/^name\s*=\s*"([^"]+)"/m), description: rx(/^description\s*=\s*"([^"]+)"/m),
      version: rx(/^version\s*=\s*"([^"]+)"/m) };
    const d = raw.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (d) meta.dependencies = [...d[1].matchAll(/"([^">=<\s]+)/g)].map(x => x[1]);
    return meta;
  }
  if (name === 'go.mod') {
    const meta = { name: rx(/^module\s+(\S+)/m), goVersion: rx(/^go\s+(\S+)/m) };
    const r = raw.match(/require\s*\(([\s\S]*?)\)/);
    meta.dependencies = r ? [...r[1].matchAll(/^\s*(\S+)\s+/gm)].map(x => x[1]) : [];
    return meta;
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`Analyzing: ${absRepo}`);
const allEntries = [...walk(absRepo)];
const allFiles = allEntries.filter(e => !e.isDir);

// Manifests (root-level only)
const manifests = {};
for (const f of allFiles) {
  const b = path.basename(f.rel);
  if (MANIFESTS.has(b) && !f.rel.includes('/')) {
    const c = safe(f.abs);
    if (c) manifests[b] = parseManifest(b, c);
  }
}

// Name / description / topics from manifests
let repoName = path.basename(absRepo), repoDesc = null, topics = [];
for (const m of Object.values(manifests)) {
  if (m?.name) repoName = m.name;
  if (m?.description) repoDesc = m.description;
  if (m?.keywords) topics.push(...m.keywords);
}
// The repository name the user actually submitted is authoritative — never ship
// the clone directory name ("target-repo") or a mismatched manifest name.
if (process.env.TARGET_REPO) repoName = process.env.TARGET_REPO;

// Key files (README)
const keyFiles = {};
for (const n of ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README']) {
  const fp = path.join(absRepo, n);
  if (fs.existsSync(fp)) {
    keyFiles[n] = safe(fp);
    if (!repoDesc && keyFiles[n]) {
      for (const ln of keyFiles[n].split('\n')) {
        const t = ln.trim();
        if (t && !t.startsWith('#') && !t.startsWith('!') && t.length > 20) { repoDesc = t.slice(0, 300); break; }
      }
    }
    break;
  }
}

// Docs (full text for .md/.txt)
const docsContent = {};
for (const f of allFiles) { if (DOC_EXT.has(path.extname(f.rel).toLowerCase())) { const c = safe(f.abs); if (c) docsContent[f.rel] = c; } }

// Source files (first 200 lines) + symbols
const sourceFiles = {}, symbols = {};
for (const f of allFiles) {
  const ext = path.extname(f.rel).toLowerCase();
  if (!SRC_EXT.has(ext)) continue;
  const r = headLines(f.abs, MAX_LINES);
  if (!r) continue;
  sourceFiles[f.rel] = r;
  const sym = extractSymbols(r.content, ext);
  if (sym) symbols[f.rel] = sym;
}

// Dependencies from manifests
const deps = {};
for (const [n, m] of Object.entries(manifests)) {
  if (!m) continue;
  if (m.dependencies) deps[n] = m.dependencies;
  if (m.devDependencies) deps[`${n} (dev)`] = m.devDependencies;
}

// Source directories (top-level dirs with source files)
const srcDirs = new Set();
for (const f of allFiles) {
  if (SRC_EXT.has(path.extname(f.rel).toLowerCase())) {
    const top = f.rel.split('/')[0];
    if (top !== f.rel) srcDirs.add(top);
  }
}

// Output
const analysis = {
  name: repoName, description: repoDesc, language: detectLanguage(allFiles),
  topics: [...new Set(topics)], analyzedAt: new Date().toISOString(),
  stats: { totalFiles: allFiles.length, sourceFiles: Object.keys(sourceFiles).length,
    docFiles: Object.keys(docsContent).length, directories: allEntries.filter(e => e.isDir).length },
  fileTree: buildTree(absRepo), sourceDirs: [...srcDirs].sort(),
  manifests, keyFiles, docsContent, sourceFiles, symbols, dependencies: deps,
};

fs.mkdirSync(absOut, { recursive: true });
const outPath = path.join(absOut, 'repo-analysis.json');
fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2));

console.log(`Done: ${analysis.stats.totalFiles} files, ${analysis.stats.sourceFiles} source, ` +
  `${analysis.stats.docFiles} docs | ${analysis.language} | ${outPath}`);
