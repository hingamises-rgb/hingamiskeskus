import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'blogi-ru');
const IMAGES_DIR = join(__dirname, '..', 'public', 'images', 'blogi');

if (!existsSync(IMAGES_DIR)) await mkdir(IMAGES_DIR, { recursive: true });

const files = (await readdir(CONTENT_DIR)).filter(f => f.endsWith('.json'));
console.log(`${files.length} articles`);

let downloaded = 0, skipped = 0, failed = 0;

for (const f of files) {
  const path = join(CONTENT_DIR, f);
  const article = JSON.parse(await readFile(path, 'utf8'));

  if (!article.image || !article.image.startsWith('http')) {
    skipped++;
    continue;
  }

  const ext = article.image.match(/f=jpeg|\.jpe?g/i) ? 'jpg'
    : article.image.match(/\.png/i) ? 'png'
    : article.image.match(/\.webp/i) ? 'webp' : 'jpg';
  const localName = `${article.slug}.${ext}`;
  const localPath = join(IMAGES_DIR, localName);
  const publicUrl = `/images/blogi/${localName}`;

  try {
    if (!existsSync(localPath)) {
      const res = await fetch(article.image);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error(`too small (${buf.length}b)`);
      await writeFile(localPath, buf);
    }
    article.imageOriginal = article.image;
    article.image = publicUrl;
    await writeFile(path, JSON.stringify(article, null, 2));
    downloaded++;
    process.stdout.write(`\r[${downloaded + skipped + failed}/${files.length}] ${localName.padEnd(70)}`);
  } catch (e) {
    failed++;
    console.log(`\nFAIL ${f}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 100));
}

console.log(`\n\nDone. Downloaded: ${downloaded}, skipped (no image): ${skipped}, failed: ${failed}`);
