// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.hingamiskeskus.ee',
  // Dev-server kasutab PORT env-i kui see on antud (nt preview-tööriistad); muidu 4321.
  server: { port: Number(process.env.PORT) || 4321 },
  adapter: vercel(),
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/checkout') &&
        !page.includes('/makse-tehtud') &&
        !page.includes('/makse-ebaonnestus') &&
        !page.includes('/muugitingimused'),
    }),
  ],
});
