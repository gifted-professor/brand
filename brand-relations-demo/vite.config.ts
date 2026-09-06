import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
import { colliderApi, createColliderService } from './server/colliderApi';
import { canvasIntegration } from './server/canvasIntegration';
import { characterApi } from './server/characterApi';
import { projectsApi } from './server/projectsApi';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['OPENAI_', 'TEXT_', 'BRAND_AI_', 'CODEX_', 'IMAGE_']);
  const environment = { ...env, ...process.env };
  const initialize = createColliderService(environment);
  return { resolve: { dedupe: ['react', 'react-dom'] }, server: { port: 5174, fs: { allow: ['..'] } }, build: { emptyOutDir: false, rollupOptions: { input: { main: 'index.html', canvas: 'canvas.html' } } }, plugins: [react(), canvasIntegration(initialize), projectsApi(environment), colliderApi(environment, initialize), characterApi({ key: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || '', model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || 'gpt-4.1-mini' })] };
});
