// Rakendab vana saidi meta-andmed (title, description, keywords) lehtedele.
import { readFile, writeFile } from 'node:fs/promises';

const MAP = {
  '/': 'src/pages/index.astro',
  '/teenused': 'src/pages/teenused.astro',
  '/vabastav-hingamine': 'src/pages/vabastav-hingamine.astro',
  '/floating': 'src/pages/floating.astro',
  '/neurovizr': 'src/pages/neurovizr.astro',
  '/soojas-vees-hingamine': 'src/pages/soojas-vees-hingamine.astro',
  '/aromatouch-kehahooldus': 'src/pages/aromatouch-kehahooldus.astro',
  '/ruumide-rent': 'src/pages/ruumide-rent.astro',
  '/terapeudid': 'src/pages/terapeudid.astro',
  '/broneeri-aeg': 'src/pages/broneeri-aeg.astro',
  '/e-pood': 'src/pages/e-pood.astro',
  '/hakka-liikmeks': 'src/pages/hakka-liikmeks.astro',
  '/kkk': 'src/pages/kkk.astro',
  '/blogi': 'src/pages/blogi.astro',
  '/privaatsuspoliitika-and-muugitingimused': 'src/pages/privaatsuspoliitika.astro',
};

const metas = JSON.parse(await readFile('scripts/old-meta.json', 'utf8'));

for (const m of metas) {
  const file = MAP[m.path];
  if (!file) { console.log('SKIP (mapping puudub):', m.path); continue; }

  let src = await readFile(file, 'utf8');
  const start = src.indexOf('<Layout');
  if (start === -1) { console.log('SKIP (<Layout puudub):', file); continue; }
  const end = src.indexOf('>', start);

  const newTag = `<Layout\n  title=${JSON.stringify(m.title)}\n  description=${JSON.stringify(m.description)}\n  keywords=${JSON.stringify(m.keywords)}\n`;
  src = src.slice(0, start) + newTag + src.slice(end);

  await writeFile(file, src);
  console.log('OK:', file, '<-', m.path);
}
console.log('Valmis.');
