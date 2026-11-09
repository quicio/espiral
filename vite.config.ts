import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // El worklet necesita una URL real para audioWorklet.addModule.
    assetsInlineLimit: 0
  }
});
