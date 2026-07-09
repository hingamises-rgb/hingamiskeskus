// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.hingamiskeskus.ee',
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
