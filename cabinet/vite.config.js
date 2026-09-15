import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The renderer is a plain SPA loaded by Electron from disk, so every asset
// reference has to be relative — an absolute /assets/... path breaks file://.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5273, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome128' },
});
