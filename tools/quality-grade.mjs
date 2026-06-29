#!/usr/bin/env node
// quality-grade.mjs — STATION 7 tool: the dual-gate completion criterion.
//
// CONTRACT: tools/CONTRACT.md (the one BuildContext, the uniform invocation/return
// convention, PURE + FAIL-LOUD). Paired ADR-0005 Station 7 / "The QA System";
// paired DDD §8.5 Scorecard + §12 (the QA dual-gate as first-class domain).
//
// JOB (one mechanical job): render the ALREADY-ASSEMBLED site LOCALLY in a real
// browser (Playwright), take FULL-PAGE screenshots at 390px (mobile) + 1440px
// (desktop), then have a vision model (GPT-4o by default) grade each screenshot
// against the VERBATIM Gate A/B rubric as a harsh critic — Gate A (A1..A5
// substance) + Gate B (B1..B5 anti-slop), each 0–100 — PLUS an explicit INV-18
// check that BOTH the architecture diagram and the flow diagram are present and
// read clearly. headlineScore = MIN across all 10 criteria. A device passes iff
// headlineScore >= 95 AND its INV-18 check is clean. The build passes iff BOTH
// devices pass. Malformed / missing per-criterion scores → LOUD STOP, never a
// silent pass (ADR-0005 loud-fail postcondition; DDD §12.3).
//
// PURE: reads ONLY its declared slice of build.json (the `page` slot) + the
//   OPENAI_API_KEY from the environment. Writes ONLY the `quality` slot + its two
//   screenshots under <build-dir>/assets/. Never reads another tool's slot/files;
//   never writes another tool's slot/files.
// FAIL-LOUD: any failure → non-zero exit + a clear `error` string; never a silent
//   PASS, never a placeholder scorecard.
//
// Usage: node tools/quality-grade.mjs <build-dir>
//   env: OPENAI_API_KEY            (required — without it the page CANNOT be graded)
//        QUALITY_VISION_MODEL      (optional, default "gpt-4o")
//        OPENAI_BASE_URL           (optional, default "https://api.openai.com/v1")

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

// ----------------------------------------------------------------------------
// Uniform return: stdout carries the SINGLE JSON result object and nothing else.
// Diagnostics go to stderr. Exit code is the source of truth (0 iff ok).
// ----------------------------------------------------------------------------
function emit(ok, outputs, error) {
  process.stdout.write(JSON.stringify({ ok, outputs: ok ? outputs : {}, error: ok ? null : error }) + '\n');
  process.exit(ok ? 0 : 1);
}
const log = (msg) => process.stderr.write(`[quality-grade] ${msg}\n`);

// ----------------------------------------------------------------------------
// The dual-gate rubric — VERBATIM from ADR-0005 / DDD §12.2. Handed to the vision
// model as a harsh critic. Do NOT paraphrase: this is load-bearing.
// ----------------------------------------------------------------------------
const RUBRIC = `You are a HARSH design-and-substance critic grading ONE full-page screenshot of a
software-explainer web page. Score every criterion 0–100. Be brutal: 95+ means
"someone who genuinely gives a shit made this and a stranger would smile and say
that's really cool". Generic AI-template output scores in the 60s–80s, never 95.

GATE A — "Do they actually get it?" (substance):
- A1 Visual effectiveness — compelling vs flat/forgettable.
- A2 Storytelling — tells a story vs lists facts.
- A3 Clueless→convinced — zero knowledge → why it matters → real examples → "oh, cool".
- A4 Usefulness-to-ME — explicitly answers "how is this useful to YOU" (cures
  engineer-blindness — the assumption the reader already cares).
- A5 Completeness of the arc — never-seen → ready to implement.

GATE B — "Did someone who gives a shit make this?" (craft / anti-slop):
- B1 Typography & hierarchy — intentional, readable, ranked vs jangly.
- B2 Alignment & grid — aligned vs subtly-off / amateur.
- B3 Spacing & rhythm — breathes, consistent vs cramped / random.
- B4 Strength & polish — cohesive, deliberate vs generic AI-template slop.
- B5 Imagery craft — beautiful + explanatory + sequenced high→low vs pretty-but-useless;
  INCLUDING the structural SVG diagrams (crisp, legible, genuinely explanatory) and the
  social card, both judged for delight + craft.

INV-18 — the three questions every developer asks. TWO diagrams are MANDATORY on every
explainer and must BOTH be present and read clearly on THIS screenshot:
- an ARCHITECTURE diagram (how it is constructed — modules / components / dependencies), and
- a PROCESS / DATA-FLOW diagram (how it works — the runtime flow).

For EACH criterion give a written rationale that cites what you actually SEE in the image.`;

// Strict JSON shape the grader MUST return (response_format: json_object).
const RESPONSE_SPEC = `Return ONLY a JSON object, no prose, with EXACTLY this shape:
{
  "gateA": { "A1": <int 0-100>, "A2": <int>, "A3": <int>, "A4": <int>, "A5": <int> },
  "gateB": { "B1": <int 0-100>, "B2": <int>, "B3": <int>, "B4": <int>, "B5": <int> },
  "rationales": {
    "A1": "<what you SAW>", "A2": "...", "A3": "...", "A4": "...", "A5": "...",
    "B1": "...", "B2": "...", "B3": "...", "B4": "...", "B5": "..."
  },
  "inv18": {
    "architecturePresent":       <true|false>,
    "architectureReadsClearly":  <true|false>,
    "architectureNote":          "<what you SAW of the architecture diagram>",
    "flowPresent":               <true|false>,
    "flowReadsClearly":          <true|false>,
    "flowNote":                  "<what you SAW of the flow/process diagram>"
  }
}
Every score is an integer 0–100. Every rationale is a non-empty string citing the image.
A missing/illegible diagram is a HARD INV-18 fail — say so honestly, do not be generous.`;

const CRITERIA_A = ['A1', 'A2', 'A3', 'A4', 'A5'];
const CRITERIA_B = ['B1', 'B2', 'B3', 'B4', 'B5'];

// ----------------------------------------------------------------------------
// Minimal static file server rooted at the assembled site dir, so Playwright
// renders the REAL page over http:// (relative assets, module scripts, fetches
// of sitemap/robots/llms all resolve) — judged on live local pixels, never a
// deployed URL (DDD §12.1). Traversal-guarded; binds 127.0.0.1 on a random port.
// ----------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function startServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const abs = path.resolve(root, '.' + rel);
      if (abs !== root && !abs.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      let target = abs;
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) { res.writeHead(404); res.end(`not found: ${rel}`); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e?.message || e)); }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ----------------------------------------------------------------------------
// Render + full-page screenshot one device. Returns the screenshot path.
// ----------------------------------------------------------------------------
async function screenshotDevice(chromium, url, device, outPath) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.dsf,
      isMobile: device.isMobile,
      hasTouch: device.isMobile,
    });
    const page = await context.newPage();
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!resp || !resp.ok()) throw new Error(`page did not load OK (status ${resp ? resp.status() : 'none'}) at ${url}`);
    // Let CSS/web-fonts/lazy assets settle, then freeze any animations for a stable shot.
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch { /* networkidle best-effort */ }
    try { await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())); } catch { /* fonts best-effort */ }
    await page.waitForTimeout(600);
    await page.screenshot({ path: outPath, fullPage: true });
    await context.close();
    return outPath;
  } finally {
    await browser.close();
  }
}

// ----------------------------------------------------------------------------
// Grade one screenshot with the vision model. LOUD on any malformed response.
// ----------------------------------------------------------------------------
function isScore(n) { return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100; }
function isText(s) { return typeof s === 'string' && s.trim().length > 0; }

async function gradeImage({ apiKey, model, baseUrl, pngPath, deviceLabel }) {
  const b64 = fs.readFileSync(pngPath).toString('base64');
  const body = {
    model,
    temperature: 0,
    max_tokens: 1800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${RUBRIC}\n\n${RESPONSE_SPEC}` },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Grade this FULL-PAGE screenshot of the explainer page rendered at ${deviceLabel}. Apply Gate A, Gate B, and the INV-18 diagram check. Return ONLY the JSON object specified.` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' } },
        ],
      },
    ],
  };

  let resp;
  try {
    resp = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`vision API request failed for ${deviceLabel}: ${e?.message || e}`);
  }
  const raw = await resp.text();
  if (!resp.ok) throw new Error(`vision API HTTP ${resp.status} for ${deviceLabel}: ${raw.slice(0, 300)}`);

  let envelope;
  try { envelope = JSON.parse(raw); } catch { throw new Error(`vision API returned non-JSON envelope for ${deviceLabel}: ${raw.slice(0, 200)}`); }
  const content = envelope?.choices?.[0]?.message?.content;
  if (!isText(content)) throw new Error(`vision API returned no message content for ${deviceLabel}`);

  let g;
  try { g = JSON.parse(content); } catch { throw new Error(`grader content is not valid JSON for ${deviceLabel}: ${String(content).slice(0, 200)}`); }

  // --- LOUD validation: a grader that cannot return a complete per-criterion
  //     scorecard is a BUILD FAILURE, never a silent pass (ADR-0005 / DDD §12). ---
  const gateA = g.gateA, gateB = g.gateB, rationales = g.rationales, inv18 = g.inv18;
  if (!gateA || !gateB || !rationales || !inv18) throw new Error(`grader response for ${deviceLabel} missing gateA/gateB/rationales/inv18`);
  for (const k of CRITERIA_A) if (!isScore(gateA[k])) throw new Error(`grader score gateA.${k} invalid/missing for ${deviceLabel} (got ${JSON.stringify(gateA[k])})`);
  for (const k of CRITERIA_B) if (!isScore(gateB[k])) throw new Error(`grader score gateB.${k} invalid/missing for ${deviceLabel} (got ${JSON.stringify(gateB[k])})`);
  for (const k of [...CRITERIA_A, ...CRITERIA_B]) if (!isText(rationales[k])) throw new Error(`grader rationale ${k} missing/empty for ${deviceLabel}`);
  for (const k of ['architecturePresent', 'architectureReadsClearly', 'flowPresent', 'flowReadsClearly']) {
    if (typeof inv18[k] !== 'boolean') throw new Error(`grader inv18.${k} must be boolean for ${deviceLabel} (got ${JSON.stringify(inv18[k])})`);
  }

  return {
    gateA: Object.fromEntries(CRITERIA_A.map((k) => [k, Math.round(gateA[k])])),
    gateB: Object.fromEntries(CRITERIA_B.map((k) => [k, Math.round(gateB[k])])),
    rationales: Object.fromEntries([...CRITERIA_A, ...CRITERIA_B].map((k) => [k, String(rationales[k]).trim()])),
    inv18: {
      architecturePresent: inv18.architecturePresent,
      architectureReadsClearly: inv18.architectureReadsClearly,
      architectureNote: isText(inv18.architectureNote) ? inv18.architectureNote.trim() : '',
      flowPresent: inv18.flowPresent,
      flowReadsClearly: inv18.flowReadsClearly,
      flowNote: isText(inv18.flowNote) ? inv18.flowNote.trim() : '',
    },
  };
}

// ----------------------------------------------------------------------------
// Assemble a per-device scorecard from a graded result + collect refine notes.
// headlineScore = MIN across all 10 criteria (never the mean — DDD §12.3 / INV-05).
// A device passes iff headlineScore >= 95 AND INV-18 is clean on that device.
// ----------------------------------------------------------------------------
function buildScorecard(deviceLabel, graded, screenshotPath) {
  const all = [...CRITERIA_A.map((k) => graded.gateA[k]), ...CRITERIA_B.map((k) => graded.gateB[k])];
  const headlineScore = Math.min(...all);
  const inv18Ok = graded.inv18.architecturePresent && graded.inv18.architectureReadsClearly &&
                  graded.inv18.flowPresent && graded.inv18.flowReadsClearly;
  const passed = headlineScore >= 95 && inv18Ok;

  const refineNotes = [];
  for (const k of CRITERIA_A) if (graded.gateA[k] < 95) refineNotes.push({ device: deviceLabel, criterion: k, score: graded.gateA[k], saw: graded.rationales[k] });
  for (const k of CRITERIA_B) if (graded.gateB[k] < 95) refineNotes.push({ device: deviceLabel, criterion: k, score: graded.gateB[k], saw: graded.rationales[k] });
  if (!graded.inv18.architecturePresent) refineNotes.push({ device: deviceLabel, criterion: 'INV-18', score: 0, saw: `ARCHITECTURE diagram MISSING. ${graded.inv18.architectureNote}` });
  else if (!graded.inv18.architectureReadsClearly) refineNotes.push({ device: deviceLabel, criterion: 'INV-18', score: 0, saw: `ARCHITECTURE diagram does not read clearly. ${graded.inv18.architectureNote}` });
  if (!graded.inv18.flowPresent) refineNotes.push({ device: deviceLabel, criterion: 'INV-18', score: 0, saw: `FLOW diagram MISSING. ${graded.inv18.flowNote}` });
  else if (!graded.inv18.flowReadsClearly) refineNotes.push({ device: deviceLabel, criterion: 'INV-18', score: 0, saw: `FLOW diagram does not read clearly. ${graded.inv18.flowNote}` });

  const scorecard = {
    device: deviceLabel,
    gateA: graded.gateA,
    gateB: graded.gateB,
    rationales: graded.rationales,
    inv18: { ...graded.inv18, passed: inv18Ok },
    headlineScore,
    passed,
    screenshot: screenshotPath,
  };
  return { scorecard, refineNotes };
}

// ----------------------------------------------------------------------------
// main — orchestrate: read inputs → screenshot both devices → grade both →
// assemble dual scorecard → merge the `quality` slot. Loud on every failure.
// ----------------------------------------------------------------------------
async function main() {
  const buildDir = process.argv[2];
  if (!buildDir) return emit(false, {}, 'usage: node tools/quality-grade.mjs <build-dir> (missing <build-dir> argument)');

  const buildJsonPath = path.join(buildDir, 'build.json');
  if (!fs.existsSync(buildJsonPath)) return emit(false, {}, `build.json not found at ${buildJsonPath}`);

  let ctx;
  try { ctx = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8')); }
  catch (e) { return emit(false, {}, `build.json is not valid JSON: ${e?.message || e}`); }

  // --- DECLARED INPUTS: ONLY the `page` slot. Absent/invalid → loud stop. ---
  const page = ctx.page;
  if (!page || typeof page !== 'object') return emit(false, {}, 'build.json has no `page` slot — assemble-page (Station 6) must run before quality-grade');
  if (!page.dir) return emit(false, {}, 'build.json `page.dir` is missing — cannot serve the assembled site');
  if (!page.htmlPath) return emit(false, {}, 'build.json `page.htmlPath` is missing — cannot grade a page that was never assembled');
  const siteDir = path.resolve(page.dir);
  const htmlPath = path.resolve(page.htmlPath);
  if (!fs.existsSync(siteDir) || !fs.statSync(siteDir).isDirectory()) return emit(false, {}, `page.dir does not exist or is not a directory: ${siteDir}`);
  if (!fs.existsSync(htmlPath)) return emit(false, {}, `page.htmlPath does not exist on disk: ${htmlPath}`);

  // --- SECRET from env (never from build.json). No key → CANNOT evaluate → loud. ---
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return emit(false, {}, 'OPENAI_API_KEY is not set — the page cannot be graded; refusing to emit a silent PASS');
  const model = process.env.QUALITY_VISION_MODEL || 'gpt-4o';
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  // --- Playwright at runtime (do NOT npm-install; loud if absent). ---
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch (e) { return emit(false, {}, `playwright is not installed (npm i -D playwright && npx playwright install chromium): ${e?.message || e}`); }

  const assetsDir = path.join(buildDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const DEVICES = [
    { label: 'mobile(390)', width: 390, height: 844, dsf: 2, isMobile: true, file: 'screenshot-mobile-390.png' },
    { label: 'desktop(1440)', width: 1440, height: 900, dsf: 1, isMobile: false, file: 'screenshot-desktop-1440.png' },
  ];

  let started;
  try {
    started = await startServer(siteDir);
  } catch (e) {
    return emit(false, {}, `could not start local static server for ${siteDir}: ${e?.message || e}`);
  }
  const baseHref = `http://127.0.0.1:${started.port}/`;

  const scorecard = [];
  const refineNotes = [];
  const screenshots = {};
  try {
    for (const d of DEVICES) {
      const shotPath = path.join(assetsDir, d.file);
      log(`rendering ${d.label} → ${path.relative(buildDir, shotPath)}`);
      await screenshotDevice(chromium, baseHref, d, shotPath);
      screenshots[d.isMobile ? 'mobile' : 'desktop'] = shotPath;

      log(`grading ${d.label} with ${model} …`);
      const graded = await gradeImage({ apiKey, model, baseUrl, pngPath: shotPath, deviceLabel: d.label });
      const { scorecard: card, refineNotes: notes } = buildScorecard(d.label, graded, shotPath);
      scorecard.push(card);
      refineNotes.push(...notes);
      log(`${d.label}: headline=${card.headlineScore} inv18=${card.inv18.passed ? 'ok' : 'FAIL'} passed=${card.passed}`);
    }
  } catch (e) {
    started.server.close();
    return emit(false, {}, `quality grading failed: ${e?.message || e}`);
  } finally {
    started.server.close();
  }

  const passed = scorecard.length === DEVICES.length && scorecard.every((c) => c.passed);
  const prevIterations = Number.isInteger(ctx.quality?.iterations) ? ctx.quality.iterations : 0;

  const quality = {
    scorecard,
    passed,
    iterations: prevIterations + 1,
    visionModel: model,
    screenshots,
    refineNotes,
    gradedAt: new Date().toISOString(),
  };

  // --- Merge ONLY the `quality` slot; every other slot is left intact. ---
  ctx.quality = quality;
  try { fs.writeFileSync(buildJsonPath, JSON.stringify(ctx, null, 2) + '\n'); }
  catch (e) { return emit(false, {}, `could not write build.json: ${e?.message || e}`); }

  return emit(true, {
    quality,
    screenshots,
    passed,
    headline: { mobile: scorecard[0]?.headlineScore, desktop: scorecard[1]?.headlineScore },
    refineNoteCount: refineNotes.length,
  }, null);
}

main().catch((e) => emit(false, {}, `unexpected error: ${e?.stack || e?.message || e}`));
