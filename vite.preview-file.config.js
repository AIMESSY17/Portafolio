// Build de VISTA PREVIA en un solo index.html (se abre con doble clic, sin servidor).
// Uso: npm run preview:file  →  genera preview/index.html
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: 'preview', emptyOutDir: true, chunkSizeWarningLimit: 5000 },
});
