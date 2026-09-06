import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadImageConfig } from '../src/providers/image-config.ts';
import { OpenAIImageProvider, ImageProviderError, referenceDataUrl } from '../src/providers/openai-image-provider.ts';
import type { ImageAsset, ImageRequest } from '../src/providers/openai-image-provider.ts';
import { loadImageBatchPlan, recordImageBatchReview, reconcileImageBatchUnknown, runImageBatch } from '../src/providers/image-batch.ts';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
try {
  try { loadEnvFile(resolve(projectDir, '.env.local')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot load .env.local.'); }
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    prompt: { type: 'string' }, 'prompt-file': { type: 'string' }, negative: { type: 'string' },
    ratio: { type: 'string' }, detail: { type: 'string' }, reference: { type: 'string', multiple: true }, help: { type: 'boolean' },
    manifest: { type: 'string' }, state: { type: 'string' }, concurrency: { type: 'string' },
    task: { type: 'string' }, 'output-hash': { type: 'string' }, evidence: { type: 'string' }, 'review-status': { type: 'string' },
    outcome: { type: 'string' }, 'asset-file': { type: 'string' },
  } });
  const action = positionals[0];
  if (values.help || !action) {
    console.log('Usage: npm run image:check\n       npm run image:generate -- --prompt "description" [--ratio 3:4] [--detail 2K] [--negative "avoid"] [--reference file.png]\n       npm run image:generate -- --prompt-file prompt.txt\n       node scripts/image-cli.ts batch --manifest jobs.json --state batch-state.json [--concurrency 4]\n       node scripts/image-cli.ts review --state batch-state.json --task core --output-hash SHA256 --evidence "Actual visual inspection findings" [--review-status approved|needs_revision]\n       node scripts/image-cli.ts reconcile --state batch-state.json --task core --outcome succeeded|failed|cancelled --evidence "Verified terminal upstream outcome" [--asset-file asset.json]\nGenerate submits one billable request. Batch runs ready independent tasks with at most four slots and reuses its durable state. referenceTasks wait for the upstream output to have an approved visual review matching its file hash. Unknown requests retain capacity until the host verifies their terminal outcome and reconciles them; succeeded recovery requires its actual asset metadata. No automatic retry. Up to four references per image. Separate processes do not share the four-slot limit; use one batch. A stale state .lock requires checking its recorded PID before manual removal.');
  } else {
    if (positionals.length !== 1 || !['check', 'generate', 'batch', 'review', 'reconcile'].includes(action)) throw new Error('Expected check, generate, batch, review or reconcile. Use --help.');
    if (action === 'review') {
      if (!values.state || !values.task || !values['output-hash'] || !values.evidence) throw new Error('Review requires --state, --task, --output-hash and --evidence.');
      const result = await recordImageBatchReview({ statePath: values.state, taskId: values.task,
        outputHash: values['output-hash'], evidence: values.evidence, status: values['review-status'] as 'approved' | 'needs_revision' | undefined });
      console.log(JSON.stringify({ taskId: values.task, review: result.tasks[values.task].review }, null, 2));
    } else if (action === 'reconcile') {
      if (!values.state || !values.task || !values.outcome || !values.evidence) throw new Error('Reconciliation requires --state, --task, --outcome and --evidence.');
      let asset: ImageAsset | undefined;
      if (values['asset-file']) {
        if ((await stat(values['asset-file'])).size > 256 * 1024) throw new Error('Asset metadata file is too large.');
        asset = JSON.parse(await readFile(values['asset-file'], 'utf8')) as ImageAsset;
      }
      const result = await reconcileImageBatchUnknown({ statePath: values.state, taskId: values.task,
        outcome: values.outcome as 'succeeded' | 'failed' | 'cancelled', evidence: values.evidence, asset });
      console.log(JSON.stringify({ taskId: values.task, record: result.tasks[values.task] }, null, 2));
    } else {
      const provider = new OpenAIImageProvider(loadImageConfig(process.env, projectDir));
      if (action === 'check') {
        const check = await provider.check();
        console.log(JSON.stringify(check, null, 2));
        if (!check.imageModelListed || !check.responsesModelListed) process.exitCode = 1;
      } else if (action === 'batch') {
        if (!values.manifest || !values.state) throw new Error('Batch requires --manifest and --state.');
        if (values.prompt || values['prompt-file'] || values.reference || values.negative || values.ratio || values.detail) throw new Error('Put image inputs in the batch manifest.');
        const plan = await loadImageBatchPlan(values.manifest);
        const result = await runImageBatch(plan, { provider, statePath: values.state,
          concurrency: values.concurrency === undefined ? 4 : Number(values.concurrency),
          onProgress: (taskId, progress) => console.error(JSON.stringify({ taskId, progress })) });
        console.log(JSON.stringify(result, null, 2));
        if (Object.values(result.tasks).some(task => task.status !== 'succeeded')) process.exitCode = 1;
      } else {
        if (values.manifest || values.state || values.concurrency) throw new Error('Use batch for --manifest, --state or --concurrency.');
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
        console.log(JSON.stringify(await provider.generate(input, progress => console.error(JSON.stringify({ progress }))), null, 2));
      }
    }
  }
} catch (error) {
  // Upstream bodies, transport messages, request content and credentials are never logged.
  if (error instanceof ImageProviderError) console.error(JSON.stringify({ error: error.code, generationStatus: error.generationStatus,
    requestId: error.requestId, retryable: false, diagnostics: error.diagnostics }));
  else console.error(JSON.stringify({ error: 'image_cli_error', message: error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]') : 'Unknown local error' }));
  process.exitCode = 1;
}
