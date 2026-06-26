#!/usr/bin/env node
// phase5-generate-images.mjs -- Generate explainer images via OpenAI gpt-image-1.
//
// Usage: node scripts/phase5-generate-images.mjs <repo-analysis.json> <explainer-site-dir>
// Env:   OPENAI_API_KEY
//
// Zero npm dependencies -- Node.js built-ins (fs, path) + fetch (Node 20+).

import fs from 'node:fs';
import path from 'node:path';

const [analysisPath, siteDir] = process.argv.slice(2);
if (!analysisPath || !siteDir) {
  console.error('Usage: node scripts/phase5-generate-images.mjs <repo-analysis.json> <explainer-site-dir>');
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) { console.error('Error: OPENAI_API_KEY environment variable is required'); process.exit(1); }

const absAnalysis = path.resolve(analysisPath);
const absSite = path.resolve(siteDir);
if (!fs.existsSync(absAnalysis)) { console.error(`Error: analysis file not found: ${absAnalysis}`); process.exit(1); }
if (!fs.existsSync(absSite)) { console.error(`Error: site directory not found: ${absSite}`); process.exit(1); }

// ── Load repo analysis ─────────────────────────────────────────────────────

const analysis = JSON.parse(fs.readFileSync(absAnalysis, 'utf8'));
const projectName = analysis.name || 'this project';
const projectDesc = analysis.description || 'a software project';
const language = analysis.language || 'software';
const topics = (analysis.topics || []).slice(0, 5).join(', ');
const context = `${projectName}: ${projectDesc}`.slice(0, 300);
const techContext = [language, topics].filter(Boolean).join(', ');

console.log(`Project: ${projectName}\nDescription: ${projectDesc}\nLanguage: ${language}`);

// ── Image definitions ───────────────────────────────────────────────────────

const NO_TEXT = 'No text, no logos, no words, no watermarks, no UI elements.';

const images = [
  {
    name: 'hero.png',
    size: '1792x1024',
    prompt: `A cinematic, professional, clean, modern illustration representing "${context}". Show an abstract, visually striking scene that conveys ${techContext} technology and innovation. Use a rich color palette with depth, lighting, and atmosphere. ${NO_TEXT} Style: editorial illustration, high production value, suitable as a website hero banner.`,
  },
  {
    name: 'architecture.png',
    size: '1024x1024',
    prompt: `A clean, professional, modern technical illustration showing the architecture of a ${language} system. The system is "${context}". Show interconnected components, data flow arrows, and modular blocks in an isometric or flat design style. Use a cool, professional color scheme with blues, grays, and accent colors. ${NO_TEXT} Style: clean technical diagram illustration, minimal and elegant.`,
  },
  {
    name: 'use-case.png',
    size: '1024x1024',
    prompt: `A professional, clean, modern illustration of a person benefiting from using "${projectName}". The tool helps with: ${projectDesc}. Show a developer or professional at a modern workspace, looking satisfied and productive. Include subtle visual metaphors for efficiency, automation, or clarity. Warm, inviting lighting. ${NO_TEXT} Style: editorial illustration, friendly and approachable, modern workplace.`,
  },
];

// ── API helpers ─────────────────────────────────────────────────────────────

async function generateImage(prompt, size) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size, quality: 'medium' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }
  const result = await res.json();
  return result.data[0].b64_json;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Generate images ─────────────────────────────────────────────────────────

const imgDir = path.join(absSite, 'assets', 'img');
fs.mkdirSync(imgDir, { recursive: true });
const generated = [];

for (let i = 0; i < images.length; i++) {
  const img = images[i];
  const outPath = path.join(imgDir, img.name);
  console.log(`\nGenerating ${img.name} (${img.size})...`);
  try {
    const b64 = await generateImage(img.prompt, img.size);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`  Saved: ${outPath}`);
    generated.push(img.name);
  } catch (err) {
    console.warn(`  Warning: failed to generate ${img.name}: ${err.message}`);
    console.warn('  Continuing without this image.');
  }
  if (i < images.length - 1) {
    console.log('  Waiting 2s before next image...');
    await sleep(2000);
  }
}

// ── Patch index.html ────────────────────────────────────────────────────────

function patchSection(html, imgFile, sectionIds) {
  for (const id of sectionIds) {
    const re = new RegExp(`(id="${id}"[\\s\\S]*?<img\\s+[^>]*src=")([^"]+)(")`);
    if (re.test(html)) return { html: html.replace(re, `$1assets/img/${imgFile}$3`), found: true };
  }
  return { html, found: false };
}

const indexPath = path.join(absSite, 'index.html');

if (generated.length > 0 && fs.existsSync(indexPath)) {
  console.log('\nPatching index.html with generated images...');
  let html = fs.readFileSync(indexPath, 'utf8');
  let patched = false;

  if (generated.includes('hero.png')) {
    // Hero img inside hero section
    const heroRe = /(<(?:section|div)[^>]*class="[^"]*hero[^"]*"[^>]*>[\s\S]*?<img\s+[^>]*src=")([^"]+)("[^>]*>)/;
    if (heroRe.test(html)) { html = html.replace(heroRe, `$1assets/img/hero.png$3`); patched = true; }
    // Background-image variant
    const bgRe = /(class="[^"]*hero[^"]*"[^>]*style="[^"]*background-image:\s*url\()([^)]+)(\))/;
    if (bgRe.test(html)) { html = html.replace(bgRe, `$1assets/img/hero.png$3`); patched = true; }
    // og:image meta
    const ogRe = /(<meta\s+property="og:image"\s+content=")([^"]+)(")/;
    if (ogRe.test(html)) { html = html.replace(ogRe, `$1assets/img/hero.png$3`); patched = true; }
  }

  if (generated.includes('architecture.png')) {
    const r = patchSection(html, 'architecture.png', ['how-it-works', 'architecture', 'how', 'pipeline', 's04']);
    html = r.html; patched = patched || r.found;
  }

  if (generated.includes('use-case.png')) {
    const r = patchSection(html, 'use-case.png', ['use-cases', 'use-case', 'benefits', 'solved', 's05']);
    html = r.html; patched = patched || r.found;
  }

  if (patched) {
    fs.writeFileSync(indexPath, html);
    console.log('  index.html updated with image references.');
  } else {
    console.log('  No matching sections found to patch (images are still saved).');
  }
} else if (generated.length === 0) {
  console.log('\nNo images were generated. Site will use fallback styling.');
} else {
  console.log('\nNo index.html found to patch. Images saved to assets/img/.');
}

console.log(`\nPhase 5 complete: ${generated.length}/${images.length} images generated.`);
if (generated.length > 0) console.log(`  Output: ${imgDir}\n  Files: ${generated.join(', ')}`);
