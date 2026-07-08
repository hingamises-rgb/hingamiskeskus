import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'src', 'content', 'blogi');
const URLS_FILE = join(__dirname, 'blog-urls.json');
const BASE = 'https://www.hingamiskeskus.ee';

const KNOWN = new Set([
  '/', '/teenused', '/vabastav-hingamine', '/floating', '/neurovizr',
  '/soojas-vees-hingamine', '/aromatouch-kehahooldus', '/ruumide-rent',
  '/terapeudid', '/broneeri-aeg', '/e-pood', '/hakka-liikmeks',
  '/paketid', '/kkk', '/ru', '/en', '/blogi',
  '/privaatsuspoliitika-and-muugitingimused'
]);

async function fetchBlogUrls() {
  console.log('Fetching blog listing page...');
  const html = await fetch(`${BASE}/blogi`).then(r => r.text());
  const urls = new Set();
  const linkRegex = /href="(https:\/\/www\.hingamiskeskus\.ee\/[^"#?]+)"/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const url = new URL(m[1]);
    const path = url.pathname;
    if (!KNOWN.has(path) && !path.startsWith('/en/') && !path.startsWith('/ru/') && !path.includes('.')) {
      urls.add(path);
    }
  }
  return [...urls].sort();
}

function slugify(path) {
  return path.replace(/^\//, '').replace(/\/$/, '');
}

function extractJsonLd(html) {
  const m = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function extractGridTextBoxes(html) {
  const marker = '&quot;type&quot;:[0,&quot;GridTextBox&quot;]';
  const contentMarker = '&quot;content&quot;:[0,&quot;';
  const blocks = [];
  let pos = 0;
  while ((pos = html.indexOf(marker, pos)) !== -1) {
    const searchArea = html.substring(pos, pos + 60000);
    const cIdx = searchArea.indexOf(contentMarker);
    if (cIdx === -1) { pos += marker.length; continue; }
    const cStart = cIdx + contentMarker.length;
    let end = cStart;
    while (end < searchArea.length) {
      const nextQuote = searchArea.indexOf('&quot;', end);
      if (nextQuote === -1) break;
      if (searchArea[nextQuote - 1] === '\\') { end = nextQuote + 6; continue; }
      if (searchArea.substring(nextQuote + 6, nextQuote + 7) === ']') {
        blocks.push(searchArea.substring(cStart, nextQuote));
        break;
      }
      end = nextQuote + 6;
    }
    pos += marker.length;
  }
  return blocks;
}

function decodeContent(content) {
  // First: decode HTML entities (quotes are &quot;)
  let s = content
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
  // Then: decode backslash escapes (now quotes are \")
  s = s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
  return s;
}

// Strip inline styles/spans that Zyro adds — keep semantic markup
function cleanContent(html) {
  return html
    // Remove <span> tags but keep content
    .replace(/<span[^>]*>/g, '')
    .replace(/<\/span>/g, '')
    // Remove <u> tags but keep content (Zyro wraps links in <u>)
    .replace(/<u[^>]*>/g, '')
    .replace(/<\/u>/g, '')
    // Convert H1 in body to H2 (only page title should be H1)
    .replace(/<h1(\s[^>]*)?>/g, '<h2>')
    .replace(/<\/h1>/g, '</h2>')
    // Remove <br> at the start of headings
    .replace(/<h([1-6])[^>]*>\s*<br\s*\/?>/g, '<h$1>')
    // Remove inline styles
    .replace(/\sstyle="[^"]*"/g, '')
    // Remove dir attributes
    .replace(/\sdir="[^"]*"/g, '')
    // Remove class attributes
    .replace(/\sclass="[^"]*"/g, '')
    // Remove data-page-id
    .replace(/\sdata-page-id="[^"]*"/g, '')
    // Remove rel attributes
    .replace(/\srel=""/g, '')
    // Remove empty target
    .replace(/\starget=""/g, '')
    // Make internal links relative
    .replace(/href="https:\/\/(?:www\.)?hingamiskeskus\.ee(\/[^"]*)"/g, 'href="$1"')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();
}

function extractHeroImageAlt(html) {
  // Find the first <img alt="..."> after block-blog-header
  const headerIdx = html.indexOf('block-blog-header');
  if (headerIdx === -1) return '';
  const searchArea = html.substring(headerIdx, headerIdx + 20000);
  const m = searchArea.match(/<img\s+alt="([^"]*)"/);
  return m ? m[1] : '';
}

async function scrapeArticle(path) {
  const url = `${BASE}${path}`;
  const html = await fetch(url).then(r => r.text());

  const jsonLd = extractJsonLd(html);
  const boxes = extractGridTextBoxes(html);
  const imageAlt = extractHeroImageAlt(html);

  // Find article body: the longest decoded text block
  let bodyRaw = '';
  let bodyLength = 0;
  for (const b of boxes) {
    const decoded = decodeContent(b);
    const plain = decoded.replace(/<[^>]+>/g, '').trim();
    if (plain.length > bodyLength) {
      bodyLength = plain.length;
      bodyRaw = decoded;
    }
  }
  const body = cleanContent(bodyRaw);

  return {
    slug: slugify(path),
    path,
    title: jsonLd?.name || '',
    description: jsonLd?.description || '',
    image: jsonLd?.image || '',
    imageAlt,
    publishedTime: jsonLd?.datePublished || '',
    modifiedTime: jsonLd?.dateModified || '',
    inLanguage: jsonLd?.inLanguage || 'et',
    body,
  };
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

  let urls;
  if (existsSync(URLS_FILE) && !process.argv.includes('--refresh')) {
    urls = JSON.parse(await readFile(URLS_FILE, 'utf8'));
    console.log(`Loaded ${urls.length} URLs from cache`);
  } else {
    urls = await fetchBlogUrls();
    await writeFile(URLS_FILE, JSON.stringify(urls, null, 2));
    console.log(`Found ${urls.length} URLs, cached to ${URLS_FILE}`);
  }

  const results = [];
  const errors = [];
  for (let i = 0; i < urls.length; i++) {
    const path = urls[i];
    process.stdout.write(`[${String(i+1).padStart(3)}/${urls.length}] ${path.padEnd(60)} `);
    try {
      const article = await scrapeArticle(path);
      results.push(article);
      const outFile = join(OUTPUT_DIR, `${article.slug}.json`);
      await writeFile(outFile, JSON.stringify(article, null, 2));
      console.log(`OK (${article.body.length}c)`);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      errors.push({ path, error: e.message });
    }
    await new Promise(r => setTimeout(r, 150));
  }

  await writeFile(join(__dirname, 'scrape-summary.json'), JSON.stringify({ total: results.length, errors }, null, 2));
  console.log(`\nDone. ${results.length} articles saved, ${errors.length} errors.`);
}

main().catch(console.error);
