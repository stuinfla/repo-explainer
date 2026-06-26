#!/usr/bin/env node
// phase6-quality-gates.mjs -- Quality gates for generated explainer sites.
// Runs after P4 (content) and P5 (images) in GitHub Actions.
// Usage: node scripts/phase6-quality-gates.mjs <site-dir> <repo-analysis-json>
// Zero npm dependencies -- Node.js built-ins only (fs, path).

import fs from 'node:fs';
import path from 'node:path';

// ── CLI ─────────────────────────────────────────────────────────────────────
const [siteDir, analysisPath] = process.argv.slice(2);
if (!siteDir || !analysisPath) { console.error('Usage: node scripts/phase6-quality-gates.mjs <site-dir> <repo-analysis-json>'); process.exit(1); }
const absSite = path.resolve(siteDir);
const absAnalysis = path.resolve(analysisPath);
if (!fs.existsSync(absSite) || !fs.statSync(absSite).isDirectory()) { console.error(`Error: site dir not found: ${absSite}`); process.exit(1); }

// ── Helpers ─────────────────────────────────────────────────────────────────
const log = (msg) => process.stderr.write(`${msg}\n`);
const read = (rel) => {
  const p = path.join(absSite, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
const fileSize = (rel) => {
  const p = path.join(absSite, rel);
  return fs.existsSync(p) ? fs.statSync(p).size : 0;
};
const check = (name, passed, message) => ({ name, passed, message });

const SECRET_RE = /(?:api[_-]?key|api[_-]?secret|token|password|secret[_-]?key|access[_-]?key|private[_-]?key|auth[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-/.]{8,}/gi;
const SUSPICIOUS_DOMAINS = ['evil.com', 'malware', 'phishing', 'crypto-miner'];

function getProjectName() {
  try { const a = JSON.parse(fs.readFileSync(absAnalysis, 'utf8')); return a.name || a.projectName || a.repo?.name || ''; }
  catch { return ''; }
}

function walkFiles(dir, rel = '') {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const r = path.join(rel, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full, r));
    else results.push({ rel: r, full, size: fs.statSync(full).size });
  }
  return results;
}

// ── Gate A: Structure completeness ──────────────────────────────────────────
function gateA() {
  log('Gate A — Structure completeness');
  const checks = [];
  const html = read('index.html');
  const hasHtml = html !== null;
  checks.push(check('index.html exists', hasHtml, hasHtml ? 'Found' : 'Missing'));
  if (hasHtml) {
    const lower = html.toLowerCase();
    const valid = ['<!doctype', '<html', '<head', '<body'].every(t => lower.includes(t));
    checks.push(check('Valid HTML structure', valid, valid ? 'Has doctype, html, head, body' : 'Missing required HTML elements'));
  }
  const cssExists = read('styles.css') !== null;
  const cssNonEmpty = cssExists && fileSize('styles.css') > 0;
  checks.push(check('styles.css exists and non-empty', cssNonEmpty, cssNonEmpty ? 'Found' : 'Missing or empty'));
  checks.push(check('main.js exists', read('main.js') !== null, read('main.js') !== null ? 'Found' : 'Missing'));

  const vJson = read('vercel.json');
  let vercelValid = false;
  if (vJson) { try { JSON.parse(vJson); vercelValid = true; } catch { /* */ } }
  checks.push(check('vercel.json valid JSON', vercelValid, vercelValid ? 'Valid' : 'Missing or invalid JSON'));

  const pJson = read('package.json');
  let pkgValid = false;
  if (pJson) { try { JSON.parse(pJson); pkgValid = true; } catch { /* */ } }
  checks.push(check('package.json valid JSON', pkgValid, pkgValid ? 'Valid' : 'Missing or invalid JSON'));

  if (hasHtml) {
    const hasContent = !(/^[\s\n]*$/.test(html.replace(/<[^>]*>/g, '')));
    checks.push(check('Has real content', hasContent, hasContent ? 'Non-placeholder content found' : 'Only placeholder content'));
  }
  return { checks, passed: checks.every(c => c.passed), score: Math.round((checks.filter(c => c.passed).length / checks.length) * 100) };
}

// ── Gate B: Content quality ─────────────────────────────────────────────────
function gateB() {
  log('Gate B — Content quality');
  const checks = [];
  const html = read('index.html') || '';
  const projName = getProjectName();

  checks.push(check('index.html >= 5000 chars', html.length >= 5000,
    `${html.length} chars (need 5000)`));

  if (projName) {
    const lower = html.toLowerCase();
    const nameLower = projName.toLowerCase();
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i;
    const titleText = (html.match(titleMatch)?.[1] || '').toLowerCase();
    checks.push(check('Project name in title', titleText.includes(nameLower),
      titleText.includes(nameLower) ? 'Found in title' : `"${projName}" not in title`));
    const heroRe = /<(?:section|div)[^>]*(?:id|class)\s*=\s*["'][^"']*hero[^"']*["'][^>]*>([\s\S]*?)<\/(?:section|div)>/i;
    const heroContent = (html.match(heroRe)?.[1] || '').toLowerCase();
    checks.push(check('Project name in hero', heroContent.includes(nameLower),
      heroContent.includes(nameLower) ? 'Found in hero' : `"${projName}" not in hero section`));
  }

  const placeholders = (html.match(/<!-- CONTENT:\S+ -->/g) || []).length;
  const sectionsOk = placeholders <= 4; // at most 4 of 9 remaining = at least 5 filled
  checks.push(check('At least 5/9 sections filled', sectionsOk,
    `${9 - placeholders}/9 sections have content (${placeholders} placeholders remain)`));

  const hasSecrets = SECRET_RE.test(html);
  checks.push(check('No API keys/tokens in HTML', !hasSecrets,
    hasSecrets ? 'Potential secrets found in HTML' : 'Clean'));

  return { checks, passed: checks.filter(c => c.passed).length >= Math.ceil(checks.length / 2), score: Math.round((checks.filter(c => c.passed).length / checks.length) * 100) };
}

// ── Gate C: Asset integrity ─────────────────────────────────────────────────
function gateC() {
  log('Gate C — Asset integrity');
  const checks = [];
  const warnings = [];
  const html = read('index.html') || '';

  const heroPath = path.join('assets', 'img', 'hero.png');
  const heroExists = fs.existsSync(path.join(absSite, heroPath));
  if (!heroExists) warnings.push('hero.png not found — site will work but look plain');
  checks.push(check('hero.png exists', heroExists, heroExists ? 'Found' : 'Missing (warn only)'));

  const imgSrcs = [...html.matchAll(/src\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
  let brokenImgs = 0;
  for (const src of imgSrcs) {
    if (/^https?:\/\//i.test(src) || /^data:/i.test(src)) continue;
    const resolved = path.join(absSite, src.replace(/^\//, ''));
    if (!fs.existsSync(resolved)) brokenImgs++;
  }
  checks.push(check('No broken local img srcs', brokenImgs === 0,
    brokenImgs === 0 ? 'All local images found' : `${brokenImgs} broken image path(s)`));

  const anchors = [...html.matchAll(/href\s*=\s*["']#([^"']+)["']/gi)].map(m => m[1]);
  let brokenAnchors = 0;
  for (const id of anchors) {
    if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) brokenAnchors++;
  }
  checks.push(check('No broken internal anchors', brokenAnchors === 0,
    brokenAnchors === 0 ? 'All anchor targets exist' : `${brokenAnchors} broken anchor(s)`));

  return { checks, passed: checks.filter(c => c.passed).length >= Math.ceil(checks.length / 2), score: Math.round((checks.filter(c => c.passed).length / checks.length) * 100), warnings };
}

// ── Gate D: Security ────────────────────────────────────────────────────────
function gateD() {
  log('Gate D — Security');
  const checks = [];
  const html = read('index.html') || '';
  const js = read('main.js') || '';

  const inlineExternal = /<script[^>]*src\s*=\s*["']https?:\/\/[^"']+["'][^>]*>/i.test(html);
  checks.push(check('No inline scripts with external URLs', !inlineExternal,
    inlineExternal ? 'External script tag found' : 'Clean'));

  const dangerousJs = /\beval\s*\(/.test(js) || /\bdocument\.write\s*\(/.test(js);
  checks.push(check('No eval/document.write in JS', !dangerousJs,
    dangerousJs ? 'Dangerous JS patterns found' : 'Clean'));

  const allContent = html + '\n' + js;
  const hasSecrets = SECRET_RE.test(allContent);
  checks.push(check('No hardcoded secrets', !hasSecrets,
    hasSecrets ? 'Potential secrets detected' : 'Clean'));

  const suspicious = SUSPICIOUS_DOMAINS.some(d => allContent.toLowerCase().includes(d));
  checks.push(check('No suspicious domain loads', !suspicious,
    suspicious ? 'Suspicious domain reference found' : 'Clean'));

  return { checks, passed: checks.every(c => c.passed), score: Math.round((checks.filter(c => c.passed).length / checks.length) * 100) };
}

// ── Gate E: Deploy readiness ────────────────────────────────────────────────
function gateE() {
  log('Gate E — Deploy readiness');
  const checks = [];
  const vJson = read('vercel.json');
  let vercelOk = false;
  if (vJson) {
    try {
      const v = JSON.parse(vJson);
      vercelOk = typeof v === 'object' && v !== null;
    } catch { /* */ }
  }
  checks.push(check('vercel.json valid structure', vercelOk,
    vercelOk ? 'Valid object' : 'Missing or invalid'));

  const pJson = read('package.json');
  let hasName = false;
  if (pJson) {
    try { hasName = !!JSON.parse(pJson).name; } catch { /* */ }
  }
  checks.push(check('package.json has name field', hasName,
    hasName ? 'Name field present' : 'Missing name field'));

  const files = walkFiles(absSite);
  const oversized = files.filter(f => f.size > 2 * 1024 * 1024);
  checks.push(check('All files under 2MB', oversized.length === 0,
    oversized.length === 0 ? 'All files OK' : `${oversized.length} file(s) over 2MB: ${oversized.map(f => f.rel).join(', ')}`));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const under20 = totalSize < 20 * 1024 * 1024;
  checks.push(check('Total site under 20MB', under20,
    `${(totalSize / 1024 / 1024).toFixed(1)}MB total`));

  return { checks, passed: checks.filter(c => c.passed).length >= Math.ceil(checks.length / 2), score: Math.round((checks.filter(c => c.passed).length / checks.length) * 100) };
}

// ── Run all gates ───────────────────────────────────────────────────────────
const results = {};
const allWarnings = [];
const allErrors = [];

for (const [key, fn] of [['A', gateA], ['B', gateB], ['C', gateC], ['D', gateD], ['E', gateE]]) {
  const result = fn();
  results[key] = { passed: result.passed, score: result.score, checks: result.checks };
  if (result.warnings) allWarnings.push(...result.warnings);
  const failed = result.checks.filter(c => !c.passed).map(c => `Gate ${key}: ${c.name} — ${c.message}`);
  if (!result.passed) allErrors.push(...failed);
  const icon = result.passed ? 'PASS' : 'FAIL';
  log(`  ${icon} Gate ${key} — score ${result.score}`);
}

const criticalPass = results.A.passed && results.D.passed;
const overallScore = Math.round(Object.values(results).reduce((s, g) => s + g.score, 0) / 5);

const report = { passed: criticalPass, score: overallScore, gates: results, warnings: allWarnings, errors: allErrors };

fs.writeFileSync(path.join(absSite, 'quality-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

log(`\nOverall: ${criticalPass ? 'PASS' : 'FAIL'} — score ${overallScore}/100`);
if (allWarnings.length) log(`Warnings: ${allWarnings.join('; ')}`);
if (!criticalPass) {
  log('Critical gate failure (A or D) — exiting with code 1');
  process.exit(1);
}
