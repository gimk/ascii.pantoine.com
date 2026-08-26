import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /*
   * Vite does not read PORT on its own. Honouring it here lets a launcher hand
   * the dev server a free port instead of failing when 5173 is already taken.
   */
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          gifenc: ['gifenc'],
        },
      },
    },
  },
});
