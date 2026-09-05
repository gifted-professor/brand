import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadImageConfig } from '../src/providers/image-config.ts';
import { OpenAIImageProvider, ImageProviderError, referenceDataUrl } from '../src/providers/openai-image-provider.ts';
import type { ImageRequest } from '../src/providers/openai-image-provider.ts';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
try {
  try { loadEnvFile(resolve(projectDir, '.env.local')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot load .env.local.'); }
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    prompt: { type: 'string' }, 'prompt-file': { type: 'string' }, negative: { type: 'string' },
    ratio: { type: 'string' }, detail: { type: 'string' }, reference: { type: 'string', multiple: true }, help: { type: 'boolean' },
  } });
  const action = positionals[0];
  if (values.help || !action) {
    console.log('Usage: npm run image:check\n       npm run image:generate -- --prompt "description" [--ratio 3:4] [--detail 2K] [--negative "avoid"] [--reference file.png]\n       npm run image:generate -- --prompt-file prompt.txt\nGenerate submits one billable request. No automatic retry. Up to four local references.');
  } else {
    if (positionals.length !== 1 || !['check', 'generate'].includes(action)) throw new Error('Expected check or generate. Use --help.');
    const provider = new OpenAIImageProvider(loadImageConfig(process.env, projectDir));
    if (action === 'check') {
      const check = await provider.check();
      console.log(JSON.stringify(check, null, 2));
      if (!check.imageModelListed || !check.responsesModelListed) process.exitCode = 1;
    } else {
      if (Boolean(values.prompt) === Boolean(values['prompt-file'])) throw new Error('Provide exactly one of --prompt or --prompt-file.');
      let prompt = values.prompt;
      if (values['prompt-file']) {
        if ((await stat(values['prompt-file'])).size > 48000) throw new Error('Prompt file is too large.');
        prompt = await readFile(values['prompt-file'], 'utf8');
      }
      if ((values.reference?.length ?? 0) > 4) throw new Error('Use at most four reference images.');
      const references: string[] = [];
      for (const path of values.reference ?? []) {
        if ((await stat(path)).size > 6 * 1024 * 1024) throw new Error('Each reference image must be at most 6 MiB.');
        references.push(referenceDataUrl(await readFile(path)));
      }
      const input: ImageRequest = { prompt: prompt!, negativePrompt: values.negative,
        ratio: values.ratio as ImageRequest['ratio'], detail: values.detail as ImageRequest['detail'], references };
      console.error('Generating one image via Responses / gpt-image-2; waiting for final image...');
      console.log(JSON.stringify(await provider.generate(input), null, 2));
    }
  }
} catch (error) {
  // Upstream bodies, transport messages, request content and credentials are never logged.
  if (error instanceof ImageProviderError) console.error(JSON.stringify({ error: error.code, generationStatus: error.generationStatus,
    requestId: error.requestId, retryable: false }));
  else console.error(JSON.stringify({ error: 'image_cli_error', message: error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]') : 'Unknown local error' }));
  process.exitCode = 1;
}
