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
    // gpt-image-1 supports only 1024x1024, 1024x1536, 1536x1024, and auto.
    // 1536x1024 is the widest landscape option — ideal for a hero banner.
    name: 'hero.png',
    size: '1536x1024',
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
//
// Two integration points, both designed to degrade gracefully if an image
// failed to generate:
//   1. Hero — wired purely via CSS (`.hero-bg { background-image: hero.png }`)
//      by Phase 3, so a missing hero.png simply 404s and leaves the dark hero.
//      Nothing to patch here.
//   2. Gallery — Phase 3 leaves a `<!-- IMG:gallery -->` marker inside the
//      gallery grid. We replace it with <figure> tiles for the diagram images
//      that actually generated, or a tasteful note if none did. A failed image
//      is therefore never rendered as a broken <img>.

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const GALLERY_MARKER = '<!-- IMG:gallery -->';
const galleryDefs = [
  { file: 'architecture.png', caption: 'System architecture' },
  { file: 'use-case.png',     caption: 'In practice' },
];

const indexPath = path.join(absSite, 'index.html');

if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');

  if (html.includes(GALLERY_MARKER)) {
    const tiles = galleryDefs.filter(g => generated.includes(g.file));
    let replacement;
    if (tiles.length > 0) {
      replacement = tiles.map(g =>
        `<figure class="gallery-item">\n` +
        `        <img src="assets/img/${g.file}" alt="${escapeAttr(projectName)} — ${g.caption}" loading="lazy" width="1024" height="1024" />\n` +
        `        <figcaption>${escapeAttr(g.caption)}</figcaption>\n` +
        `      </figure>`
      ).join('\n      ');
    } else {
      replacement = '<p class="text-muted">Visual diagrams for this project are coming soon.</p>';
    }
    html = html.replace(GALLERY_MARKER, replacement);
    fs.writeFileSync(indexPath, html);
    console.log(`\nGallery populated with ${tiles.length} image(s): ${tiles.map(t => t.file).join(', ') || 'none'}.`);
  } else {
    console.log('\nGallery marker (<!-- IMG:gallery -->) not found — skipping gallery patch.');
  }

  if (generated.includes('hero.png')) {
    console.log('Hero image generated — wired via CSS background (assets/img/hero.png).');
  } else {
    console.log('Hero image not generated — hero falls back to its dark gradient.');
  }
} else {
  console.log('\nNo index.html found to patch. Images saved to assets/img/.');
}

console.log(`\nPhase 5 complete: ${generated.length}/${images.length} images generated.`);
if (generated.length > 0) console.log(`  Output: ${imgDir}\n  Files: ${generated.join(', ')}`);
