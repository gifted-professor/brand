import type { Project, Side } from '../src/collaboration/model';

export const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const textLines = (value: string, max: number, lines: number) => value.split('\n').flatMap(line => Array.from(line).reduce<string[]>((acc, c, i) => { const index = Math.floor(i / max); acc[index] = (acc[index] || '') + c; return acc; }, [])).slice(0, lines);
export function posterSvg(project: Project, side: Side, photo?: string, logo?: string): string {
  const { brand, visual } = project.brands[side];
  const partner = project.brands[side === 'a' ? 'b' : 'a'];
  const lines = textLines(project.headlines[side], 12, 3);
  const name = escapeXml(brand.name);
  const footer = `${brand.fictional && partner.brand.fictional ? '虚构品牌 · ' : ''}联名概念预演 · V${project.revision}`;
  const width = 900, height = project.channel === 'social' ? 1200 : 1272;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="900" height="${height}" fill="${visual.background}"/>
  <g fill="${visual.foreground}" font-family="'Noto Sans SC','Hiragino Sans GB','PingFang SC',sans-serif">
  ${logo ? `<image href="${logo}" x="68" y="42" width="260" height="84" preserveAspectRatio="xMinYMid meet"/>` : `<text x="68" y="110" font-size="${brand.name.length > 12 ? 30 : 50}" font-weight="600">${name}</text>`}
  <text x="70" y="149" font-family="sans-serif" font-size="20" letter-spacing="2">${escapeXml(visual.wordmark)}</text>
  ${lines.map((line, i) => `<text x="68" y="${268 + i * 93}" font-size="${Array.from(line).length > 9 ? 55 : 76}" font-weight="500">${escapeXml(line)}</text>`).join('')}
  <text x="70" y="525" font-size="22">本期一起推荐</text>
  <text x="70" y="566" font-size="${partner.brand.name.length > 16 ? 21 : 29}">${escapeXml(partner.brand.name)}</text>
  </g>
  ${photo ? `<image href="${photo}" x="0" y="620" width="900" height="${height - 686}" preserveAspectRatio="xMidYMid slice"/>` : `<g fill="none" stroke="${visual.foreground}" stroke-width="2"><path d="M68 745H832M68 950H832"/><circle cx="350" cy="850" r="70"/><circle cx="550" cy="850" r="70"/><path d="M420 850H480"/></g><text x="450" y="1050" text-anchor="middle" font-family="sans-serif" font-size="22" fill="${visual.foreground}">品牌内容互荐 · 场景素材待补充</text>`}
  <rect y="${height - 66}" width="900" height="66" fill="${visual.foreground}"/>
  <text x="450" y="${height - 25}" text-anchor="middle" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-size="22" fill="${visual.background}">${escapeXml(footer)}</text>
  </svg>`;
}
