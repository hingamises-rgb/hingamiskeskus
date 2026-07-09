// Asendab lehtedel kopeeritud <header> plokid ühise Header komponendiga.
import { readFile, writeFile } from 'node:fs/promises';

const PAGES = {
  'src/pages/index.astro': 'avaleht',
  'src/pages/teenused.astro': 'teenused',
  'src/pages/vabastav-hingamine.astro': 'teenused',
  'src/pages/floating.astro': 'teenused',
  'src/pages/neurovizr.astro': 'teenused',
  'src/pages/soojas-vees-hingamine.astro': 'teenused',
  'src/pages/aromatouch-kehahooldus.astro': 'teenused',
  'src/pages/ruumide-rent.astro': 'teenused',
  'src/pages/terapeudid.astro': 'teenused',
  'src/pages/e-pood.astro': 'epood',
  'src/pages/checkout.astro': 'epood',
  'src/pages/makse-tehtud.astro': 'epood',
  'src/pages/makse-ebaonnestus.astro': 'epood',
  'src/pages/hakka-liikmeks.astro': 'liikmeks',
  'src/pages/blogi.astro': 'blogi',
  'src/pages/kkk.astro': 'kkk',
  'src/pages/privaatsuspoliitika.astro': '',
};

for (const [file, active] of Object.entries(PAGES)) {
  let src = await readFile(file, 'utf8');

  const start = src.indexOf('<header class="header">');
  const endMarker = '</header>';
  const end = src.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    console.log(`SKIP (header puudub): ${file}`);
    continue;
  }

  const replacement = active ? `<Header active="${active}" />` : `<Header />`;
  src = src.slice(0, start) + replacement + src.slice(end + endMarker.length);

  // Lisa import esimese impordi järele
  if (!src.includes("components/Header.astro")) {
    src = src.replace(
      /^(import Layout from [^\n]+\n)/m,
      `$1import Header from '../components/Header.astro';\n`
    );
  }

  await writeFile(file, src);
  console.log(`OK: ${file} (active=${active || '-'})`);
}
console.log('Valmis.');
