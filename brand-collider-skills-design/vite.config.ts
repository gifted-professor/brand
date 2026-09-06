import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
const generatedDirectories = ['./outputs/', './tmp/', '../outputs/', '../tmp/']
  .map(path => normalizePath(fileURLToPath(new URL(path, import.meta.url))).replace(/\/$/, ''));
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4318' },
    // Downloaded source HTML and CLI/media evidence are runtime data, not pages
    // to reload. Keep src/ and web/ under the normal development watcher.
    watch: { ignored: path => generatedDirectories.some(directory => {
      const normalized = normalizePath(path);
      return normalized === directory || normalized.startsWith(`${directory}/`);
    }) },
  },
  build: { outDir: 'dist' },
});
