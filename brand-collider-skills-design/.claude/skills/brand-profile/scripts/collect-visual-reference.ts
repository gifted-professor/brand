#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { collectVisualReference, VisualReferenceError, REFERENCE_SOURCE_CLASSES } from '../../../../src/visual-reference.ts';
import type { VisualReferenceInput } from '../../../../src/visual-reference.ts';

try {
  const { values } = parseArgs({ options: {
    'source-page': { type: 'string' }, 'image-url': { type: 'string' }, output: { type: 'string' },
    subject: { type: 'string' }, version: { type: 'string' }, title: { type: 'string' }, publisher: { type: 'string' },
    'source-class': { type: 'string' }, help: { type: 'boolean' },
  }, allowPositionals: false, strict: true });
  if (values.help) {
    console.log(`Usage: node .claude/skills/brand-profile/scripts/collect-visual-reference.ts --source-page URL --image-url OBSERVED_IMAGE_URL --subject NAME --output DIRECTORY [--version VERSION] [--title TITLE] [--publisher NAME] [--source-class ${REFERENCE_SOURCE_CLASSES.join('|')}]
Use a source page you have actually read and an image URL observed there or in its documented source. This command re-fetches the public page and downloads one PNG/JPEG/WebP, preserving its original bytes and watermarks. No search, login, proxy bypass, image generation or automatic identity verification.
The JSON result records source/final URLs, local path, hash and dimensions. Source class/identity/visual inspection/usage rights remain unverified. Open the local image and verify identity before generation. It is a local reference ID, not a registered server asset ID.`);
  } else {
    if (!values['source-page'] || !values['image-url'] || !values.subject || !values.output) throw new VisualReferenceError('required_arguments_missing');
    const input: VisualReferenceInput = { sourcePageUrl: values['source-page'], imageUrl: values['image-url'],
      subject: values.subject, outputDir: values.output, version: values.version, title: values.title, publisher: values.publisher,
      sourceClass: values['source-class'] as VisualReferenceInput['sourceClass'] };
    console.log(JSON.stringify(await collectVisualReference(input), null, 2));
  }
} catch (error) {
  // Never print upstream bodies, native decoder diagnostics or credentials embedded in malformed URLs.
  console.error(JSON.stringify({ error: error instanceof VisualReferenceError ? error.message : 'reference_collection_failed' }));
  process.exitCode = 1;
}
