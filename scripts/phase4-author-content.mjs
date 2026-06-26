#!/usr/bin/env node
// phase4-author-content.mjs -- Generate explainer content via OpenAI and inject
// into the templated index.html produced by Phase 3.
//
// Reads the structured repo analysis from Phase 2 and calls gpt-4o to author
// HTML content for each section, then replaces <!-- CONTENT:section-name -->
// placeholders in index.html.
//
// Usage: node scripts/phase4-author-content.mjs <repo-analysis.json> <site-dir>
// Example: node scripts/phase4-author-content.mjs kb-output/repo-analysis.json explainer-site/
//
// Requires: OPENAI_API_KEY env var.  Zero npm dependencies (Node 20+ fetch).

import fs from 'node:fs';
import path from 'node:path';

// ── CLI args ───────────────────────────────────────────────────────────────

const [analysisPath, siteDir] = process.argv.slice(2);

if (!analysisPath || !siteDir) {
  console.error('Usage: node scripts/phase4-author-content.mjs <repo-analysis.json> <site-dir>');
  process.exit(1);
}

const absAnalysis = path.resolve(analysisPath);
const absSite = path.resolve(siteDir);

if (!fs.existsSync(absAnalysis)) {
  console.error(`Error: analysis file not found: ${absAnalysis}`);
  process.exit(1);
}
if (!fs.existsSync(absSite) || !fs.statSync(absSite).isDirectory()) {
  console.error(`Error: site directory not found: ${absSite}`);
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// ── Load inputs ────────────────────────────────────────────────────────────

const analysis = JSON.parse(fs.readFileSync(absAnalysis, 'utf8'));

const indexPath = path.join(absSite, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`Error: index.html not found in ${absSite}`);
  process.exit(1);
}
let html = fs.readFileSync(indexPath, 'utf8');

// ── Extract key info from analysis ─────────────────────────────────────────

const projectName = analysis.name || 'this project';
const projectDesc = analysis.description || '';
const language = analysis.language || 'Unknown';
const topics = (analysis.topics || []).join(', ');
const stats = analysis.stats || {};

const depList = [];
for (const [source, deps] of Object.entries(analysis.dependencies || {})) {
  if (Array.isArray(deps)) depList.push(...deps.slice(0, 15));
}
const depsStr = depList.length > 0
  ? `Key dependencies: ${depList.slice(0, 20).join(', ')}`
  : 'No notable dependencies detected.';

const readme = Object.values(analysis.keyFiles || {})[0] || '';
const readmeExcerpt = readme.slice(0, 3000);

const sourceDirs = (analysis.sourceDirs || []).join(', ') || 'N/A';

const fileTreeSummary = buildTreeSummary(analysis.fileTree, '', 0);

const symbolSummary = buildSymbolSummary(analysis.symbols || {});

// Manifest info
const manifestInfo = [];
for (const [name, meta] of Object.entries(analysis.manifests || {})) {
  if (!meta) continue;
  const parts = [];
  if (meta.version) parts.push(`version ${meta.version}`);
  if (meta.scripts && meta.scripts.length) parts.push(`scripts: ${meta.scripts.join(', ')}`);
  if (parts.length) manifestInfo.push(`${name}: ${parts.join('; ')}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildTreeSummary(tree, prefix, depth) {
  if (!tree || depth > 2) return '';
  const lines = [];
  for (const d of (tree.dirs || [])) {
    lines.push(`${prefix}${d.name}/`);
    if (d.children) lines.push(buildTreeSummary(d.children, prefix + '  ', depth + 1));
  }
  for (const f of (tree.files || []).slice(0, 10)) {
    lines.push(`${prefix}${f}`);
  }
  if ((tree.files || []).length > 10) {
    lines.push(`${prefix}... and ${tree.files.length - 10} more files`);
  }
  return lines.filter(Boolean).join('\n');
}

function buildSymbolSummary(symbols) {
  const funcs = [];
  const classes = [];
  const types = [];
  for (const [file, sym] of Object.entries(symbols)) {
    for (const f of (sym.functions || []).slice(0, 5)) funcs.push(`${f} (${file})`);
    for (const c of (sym.classes || []).slice(0, 5)) classes.push(`${c} (${file})`);
    for (const t of (sym.types || []).slice(0, 5)) types.push(`${t} (${file})`);
  }
  const parts = [];
  if (funcs.length) parts.push(`Key functions: ${funcs.slice(0, 15).join(', ')}`);
  if (classes.length) parts.push(`Key classes: ${classes.slice(0, 10).join(', ')}`);
  if (types.length) parts.push(`Key types: ${types.slice(0, 10).join(', ')}`);
  return parts.join('\n') || 'No symbols extracted.';
}

/** Build the context block sent alongside every section prompt. */
function projectContext() {
  return [
    `Project name: ${projectName}`,
    `Description: ${projectDesc}`,
    `Primary language: ${language}`,
    topics ? `Topics/keywords: ${topics}` : null,
    `Stats: ${stats.totalFiles || '?'} files, ${stats.sourceFiles || '?'} source files, ${stats.docFiles || '?'} doc files`,
    `Source directories: ${sourceDirs}`,
    depsStr,
    manifestInfo.length ? `Manifests:\n${manifestInfo.join('\n')}` : null,
    symbolSummary ? `Symbols:\n${symbolSummary}` : null,
    fileTreeSummary ? `File structure:\n${fileTreeSummary}` : null,
    readmeExcerpt ? `README excerpt:\n${readmeExcerpt}` : null,
  ].filter(Boolean).join('\n\n');
}

const SYSTEM_PROMPT =
  'You are a technical writer creating a visual explainer website. ' +
  'Output clean HTML (no markdown). Use semantic elements. Be warm, clear, and engaging. ' +
  'Write for a smart person who has never seen this project. ' +
  'Do NOT include an <h1> or <h2> heading in your output — each section already ' +
  'has its own heading, so a heading from you would duplicate it. Begin directly ' +
  'with the body content (paragraphs, lists, cards). You MAY use <h3> for ' +
  'sub-points within the section. ' +
  'Do NOT include <script> tags, inline JavaScript, or any executable code in your output. ' +
  'Do NOT wrap your output in ```html fences -- output raw HTML only.';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callOpenAI(sectionPrompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: sectionPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  // Strip markdown fences if the model wraps its output
  return content.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

// ── Section definitions ────────────────────────────────────────────────────

const ctx = projectContext();

const SECTIONS = [
  {
    name: 'hero',
    prompt: [
      `Generate a compelling hero section for "${projectName}".`,
      'Include: an <h1> with a one-line tagline, a <p class="tagline"> with a punchy subtitle, and a <p class="description"> with a 2-sentence description.',
      'Make it exciting but accurate. Do not invent features that are not described below.',
      '', ctx,
    ].join('\n'),
  },
  {
    name: 'grounding',
    prompt: [
      `Write a "What is ${projectName}?" section.`,
      'Write 2-3 paragraphs explaining what it is in plain language, like you\'re explaining to a smart friend who is not a developer.',
      'Use <p> tags. Be concrete -- mention what it actually does, not just abstract benefits.',
      '', ctx,
    ].join('\n'),
  },
  {
    name: 'problem',
    prompt: [
      `Write a "What problem does ${projectName} solve?" section.`,
      'Describe the pain point this project addresses. Use a relatable scenario to illustrate.',
      'Write 2-3 paragraphs in <p> tags. Be specific about the frustrations people face without this tool.',
      '', ctx,
    ].join('\n'),
  },
  {
    name: 'solution',
    prompt: [
      `Write a "How does ${projectName} solve it?" section.`,
      'Explain the key insight or approach. What makes this different from alternatives?',
      'Write 2-3 paragraphs followed by a feature list (<ul> with <li> items) highlighting the top 4-6 capabilities.',
      '', ctx,
    ].join('\n'),
  },
  {
    name: 'how-it-works',
    prompt: [
      `Write a "How it works" section for ${projectName}.`,
      'Describe the architecture or workflow end-to-end.',
      'Use an <ol> for the main steps. If appropriate, include a simple text-based flow diagram inside a <pre><code> block showing the pipeline (e.g., Input -> Process -> Output).',
      'Keep it clear and concise -- a developer should understand the flow in 30 seconds.',
      '', ctx,
    ].join('\n'),
  },
  {
    name: 'use-cases',
    prompt: [
      `Write a "Use cases" section for ${projectName}.`,
      'Present 3-4 concrete use cases, each as a card-style block.',
      'For each use case, output: <div class="use-case-card"><h3>{title}</h3><p>{2-sentence description}</p><p class="audience"><strong>For:</strong> {who it is for}</p></div>',
      'Make the use cases specific and practical, not generic.',
      '', ctx,
    ].join('\n'),
  },
  {
    name: 'getting-started',
    prompt: [
      `Write a "Getting started" section for ${projectName}.`,
      'Provide installation steps, the first command to run, and what output to expect.',
      'Format as numbered steps (<ol>) with code blocks (<pre><code>) for commands.',
      'If the README has install instructions, follow them. Otherwise, infer from the language and manifest files.',
      'Keep it to 3-5 steps max.',
      '', ctx,
    ].join('\n'),
  },
  {
    name: 'gallery',
    fallback:
      '<div class="gallery-placeholder">' +
      '<p>Visual assets for this explainer are being generated.</p>' +
      '<p>Screenshots, diagrams, and interactive demos will appear here once rendering is complete.</p>' +
      '</div>',
  },
  {
    name: 'provenance',
    prompt: [
      `Write a "Credits & provenance" section for ${projectName}.`,
      'Include:',
      '- A <p> thanking the project author(s) / contributors',
      '- A <p> with "Source repository" linking to the project (use a placeholder href="#source-repo" since we do not know the URL at generation time)',
      '- A <p> noting the license if mentioned in the analysis, otherwise say "See the source repository for license details."',
      'Keep it short -- 3-4 short paragraphs or a small <dl> definition list.',
      '', ctx,
    ].join('\n'),
  },
];

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Phase 4: Authoring explainer content for "${projectName}"`);
  console.log(`  Analysis:  ${absAnalysis}`);
  console.log(`  Site dir:  ${absSite}`);
  console.log(`  Sections:  ${SECTIONS.length}`);
  console.log('');

  let succeeded = 0;
  let failed = 0;

  for (const section of SECTIONS) {
    const placeholder = `<!-- CONTENT:${section.name} -->`;

    if (!html.includes(placeholder)) {
      console.log(`  [skip] ${section.name} -- placeholder not found`);
      continue;
    }

    // Gallery uses a static fallback, no API call
    if (section.fallback && !section.prompt) {
      html = html.replace(placeholder, section.fallback);
      console.log(`  [done] ${section.name} (static fallback)`);
      succeeded++;
      continue;
    }

    try {
      console.log(`  [call] ${section.name} ...`);
      const content = await callOpenAI(section.prompt);
      html = html.replace(placeholder, content);
      console.log(`  [done] ${section.name} (${content.length} chars)`);
      succeeded++;
    } catch (err) {
      console.error(`  [fail] ${section.name}: ${err.message}`);
      const fallbackHtml =
        `<div class="content-error">` +
        `<p>Content for this section could not be generated. ` +
        `Please visit the source repository for details about ${projectName}.</p>` +
        `</div>`;
      html = html.replace(placeholder, fallbackHtml);
      failed++;
    }

    // Rate-limit: 1 second between API calls
    await delay(1000);
  }

  // ── Update <title> and meta description ──────────────────────────────────

  const titleText = `${projectName} -- Visual Explainer`;
  html = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeHtml(titleText)}</title>`,
  );

  const metaDesc = projectDesc
    ? projectDesc.slice(0, 160)
    : `Visual explainer for ${projectName}`;
  if (html.includes('<meta name="description"')) {
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${escapeHtml(metaDesc)}">`,
    );
  } else {
    html = html.replace(
      '</head>',
      `  <meta name="description" content="${escapeHtml(metaDesc)}">\n</head>`,
    );
  }

  // ── Write output ─────────────────────────────────────────────────────────

  fs.writeFileSync(indexPath, html, 'utf8');

  console.log('');
  console.log(`Phase 4 complete:`);
  console.log(`  Succeeded: ${succeeded}/${SECTIONS.length}`);
  console.log(`  Failed:    ${failed}/${SECTIONS.length}`);
  console.log(`  Output:    ${indexPath}`);

  if (failed > 0) process.exit(1);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
