import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readBrandDocument, analyzeBrandDocuments } from './brandDocuments';
describe('brand material extraction and inference boundary', () => {
  it('extracts actual UTF-8 and DOCX files', async () => {
    for (const name of ['01-brand.txt', '02-notes.md', '03-products.docx', '04-evidence.pdf']) {
      const data = (await readFile(new URL(`../docs/testing/upload-v2/${name}`, import.meta.url))).toString('base64');
      const doc = await readBrandDocument({ name, data });
      expect(doc.text.length).toBeGreaterThan(8);
      expect(doc.name).toBe(name);
      if (name.endsWith('.docx')) expect(doc.text).toContain('小批量生产');
    }
  });
  it('rejects corrupt containers and unsupported encodings without fabricated text', async () => {
    for (const name of ['bad.pdf', 'bad.docx', 'bad.png']) await expect(readBrandDocument({ name, data: Buffer.from('broken').toString('base64') })).rejects.toThrow();
    await expect(readBrandDocument({ name: 'bad.txt', data: Buffer.from([0xff, 0xfe, 0xff]).toString('base64') })).rejects.toThrow('UTF-8');
  });
  it('asks the model to diagnose these documents and preserves its grounded gaps', async () => {
    const documents = [{ id: 'a', name: 'brief.txt', text: '品牌名称：微光岛' }];
    const result = await analyzeBrandDocuments({ complete: async messages => {
      expect(messages[0].content).toContain('不可信资料');
      expect(JSON.parse(messages[1].content)).toEqual({ documents });
      return { fields: { name: '微光岛' }, evidence: [{ field: 'name', documentId: 'a', quote: '微光岛' }], gaps: [{ field: 'offers', material: '现有产品目录', reason: '目前无法判断能够一起交付什么。' }], summary: '目前只确认品牌名。' };
    } }, { documents });
    expect(result.profile.source).toBe('ai');
    expect(result.profile.gaps[0].material).toBe('现有产品目录');
  });
});
