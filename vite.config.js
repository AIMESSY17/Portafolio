import { defineConfig } from 'vite';

export default defineConfig({
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
