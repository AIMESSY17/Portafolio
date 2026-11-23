import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // carpetas de trabajo que no son código: copiar archivos grandes ahí no tiene que tirar el servidor
    watch: { ignored: ['**/referencias/**', '**/referencia/**', '**/respaldo/**', '**/public/_tmp/**', '**/scripts/assets/**'] },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Three.js en su propio archivo: se cachea aparte y no se vuelve a bajar en cada deploy
        manualChunks: { three: ['three'], anim: ['gsap', 'lenis'] },
      },
    },
  },
});
