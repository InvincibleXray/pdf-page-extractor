import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://invinciblexray.github.io',
  base: '/pdf-page-extractor',
  integrations: [tailwind()]
});
