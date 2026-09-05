"""补齐案例来源。仅通过 lark-cli 修改飞书，保留来源读取与事实核验的区别。"""
from pathlib import Path
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse
import publish_cases as pub

HERE = Path(__file__).resolve().parent
LIBRARY = HERE.parent / 'library.json'
INPUTS = [Path('/tmp') / name for name in (
    'brand-source-backfill-61-63.json',
    'brand-source-backfill-64-67.json',
    'brand-source-backfill-trials.json',
)]
SOURCE_FIELDS = ['来源链接', '来源说明', '来源核查状态', '全部来源链接', '来源核查说明']
READ = '已读外部正文（限定范围）'
LEAD = '仅原报告链接（未逐条核查）'


def is_primary(source):
    return source['kind'].startswith('web_primary') or source['kind'] in {
        'official_disclosure', 'official_press_release', 'official_product_page',
        'syndicated_official_press_release',
    }


def prepare():
    batches = [item for path in INPUTS for item in json.loads(path.read_text())]
    expected_ids = {'C11', 'C23', 'C24', 'C47', 'C60', *[f'C{i}' for i in range(61, 68)]}
    assert {b['caseId'] for b in batches} == expected_ids
    assert len(batches) == len(expected_ids)
    for backup, source in [(HERE / 'case-rows-before-source-backfill.json', HERE / 'case-rows.json'),
                           (HERE / 'library-before-source-backfill.json', LIBRARY),
                           (HERE / 'view-plan-before-source-backfill.json', HERE / 'view-plan.json')]:
        if not backup.exists():
            shutil.copyfile(source, backup)
    library = json.loads((HERE / 'library-before-source-backfill.json').read_text())
    rows = json.loads((HERE / 'case-rows-before-source-backfill.json').read_text())
    now = datetime.now(timezone.utc).isoformat()
    batches.append({'caseId': 'C01', 'sources': [{
        'title': 'Luckin Coffee x Kweichow Moutai Theme Store Opens',
        'url': next(s['url'] for s in library['sources'] if s['id'] == 'SRC-LUCKIN-20240408'),
        'publisher': '瑞幸咖啡投资者关系', 'publishedAt': '2024-04-08',
        'kind': 'web_primary', 'readAt': library['updatedAt'],
        'supports': ['前轮已读瑞幸官网正文，支持指定首日及截至2023年末的销量和销售额披露。'],
        'limitations': ['仅支持 C01-GPT-outcome 的历史销售披露；不是独立审计，不证明双方利润、增量归因或当前在售。'],
    }]})
    by_case = {b['caseId']: b['sources'] for b in batches}
    sources_by_url = {s['url']: s for s in library['sources'] if s.get('url')}
    cases = {c['id']: c for c in library['cases']}
    for cid, sources in by_case.items():
        case = cases[cid]
        readings = []
        for index, source in enumerate(sources, 1):
            assert source['url'].startswith(('https://', 'http://'))
            assert source['supports'] and source['limitations'] and source['title']
            known = sources_by_url.get(source['url'])
            if known is None:
                sid = f'SRC-CASE-{cid}-20260905-{index:02}'
                known = {
                    'id': sid, 'kind': 'web_primary' if is_primary(source) else 'web_secondary',
                    'path': None, 'url': source['url'], 'sha256': None,
                    'lineageGroup': 'gopro-redbull-2016-05-24-release' if cid == 'C23' else f'{urlparse(source["url"]).netloc}:{source["url"]}',
                    'status': 'read', 'title': source['title'], 'publisher': source['publisher'],
                    'publishedAt': source.get('publishedAt'), 'importedAt': now,
                    'notes': '本轮实际读取案例来源。具体支持范围与局限见案例 sourceReadings；不自动升级全部断言。',
                }
                library['sources'].append(known)
                sources_by_url[source['url']] = known
            source['sourceId'] = known['id']
            ref = {'sourceId': known['id'], 'locator': source['title'] + '；' + source['supports'][0]}
            if not any(r['sourceId'] == known['id'] for r in case['sourceRefs']):
                case['sourceRefs'].append(ref)
            readings.append({
                'sourceId': known['id'], 'checkedAt': source['readAt'],
                'supportedScope': source['supports'], 'limitations': source['limitations'],
                'claimReview': '仅记录案例来源读取范围；未完成的原断言逐条核验保持原状态。',
            })
            if source['url'] not in case['candidateUrls']:
                case['candidateUrls'].append(source['url'])
        case['sourceReadings'] = readings

    for row in rows:
        fields = row['fields']; cid = fields['案例编号']; case = cases[cid]
        read_sources = by_case.get(cid, [])
        source_links = []
        for source in read_sources:
            source_links.append(f'【已读正文】{source["publisher"]}｜{source.get("publishedAt") or "发布日期未标明"}｜{source["title"]}\n{source["url"]}')
        read_urls = {s['url'].rstrip('/') for s in read_sources}
        for url in case['candidateUrls']:
            if url.rstrip('/') not in read_urls:
                source_links.append(f'【原报告链接，未逐条核查】{urlparse(url).netloc}\n{url}')
        assert source_links, cid
        fields['全部来源链接'] = '\n\n'.join(source_links)
        fields['来源核查状态'] = READ if read_sources else LEAD
        if read_sources:
            fields['来源链接'] = read_sources[0]['url']
            notes = []
            for source in read_sources:
                notes.append('\n'.join([
                    f'{source["title"]}｜{source["publisher"]}｜{source.get("publishedAt") or "发布日期未标明"}',
                    '来源性质：' + ('品牌/企业原始披露' if is_primary(source) else '媒体报道，机构或品牌表态可能为转述'),
                    '读取日期：' + source['readAt'][:10],
                    '支持范围：' + '；'.join(source['supports']),
                    '仍未证明：' + '；'.join(source['limitations']),
                    source['url'],
                ]))
            fields['来源核查说明'] = '\n\n'.join(notes)
            fields['来源说明'] += '\n本轮已补充可读取的外部案例来源，标题、出处与支持范围见“来源核查说明”；原报告等级只代表原始导入情况。'
        else:
            fields['来源核查说明'] = '已完整恢复原报告所附外部链接。本轮尚未逐条读取这些页面，不能据此认定链接有效或全部案例事实已核验；原报告出处保留在“来源说明”。'
    library['revision'] += 1
    library['updatedAt'] = now
    staged = LIBRARY.with_name('library-source-backfill-staged.json')
    pub.dump(staged, library)
    subprocess.run([sys.executable, str(pub.ROOT / 'brand-case-research/scripts/case_library.py'), 'validate', str(staged)], check=True)
    staged.replace(LIBRARY)
    pub.dump(HERE / 'source-readings.json', batches)
    pub.dump(HERE / 'case-rows.json', rows)
    pub.prepare()
    print('Prepared sources for 67 cases; read sources for', len(by_case), 'cases', flush=True)


def publish():
    rows = pub.inputs()
    current_fields = pub.call('field-list')
    names = {f['name']: f for f in current_fields['fields']}
    schema = json.loads((HERE / 'field-schema.json').read_text())
    for field in schema:
        if field['name'] not in names:
            pub.call('field-create', body=field, label='source-field-' + field['name'])
    current = {r['fields']['案例编号']: r for r in pub.records()}
    baseline = {r['fields']['案例编号']: r['fields'] for r in json.loads((HERE / 'sources-audit-records-before.json').read_text())}
    for index, row in enumerate(rows, 1):
        fields = row['fields']; cid = fields['案例编号']; remote = current[cid]
        patch = {name: fields[name] for name in SOURCE_FIELDS if remote['fields'].get(name) != fields[name]}
        for name in patch:
            if remote['fields'].get(name) not in (baseline[cid].get(name), None, ''):
                raise RuntimeError('Source was edited remotely; inspect ' + cid + ' / ' + name)
        if patch:
            pub.call('record-upsert', '--record-id', remote['id'], body=patch, label='source-updated-' + cid)
        if index % 10 == 0 or index == len(rows):
            print('Published source fields:', index, '/', len(rows), flush=True)
    pub.dump(HERE / 'fields-after.json', {'ok': True, 'data': pub.call('field-list')})


def views():
    plans = json.loads((HERE / 'view-plan.json').read_text())
    for plan in plans:
        visible = pub.call('view-get-visible-fields', '--view-id', plan['id'])['visible_fields']
        kept = [name for name in visible if name not in ('来源链接', '来源核查状态')]
        at = kept.index('案例编号') + 1
        kept[at:at] = ['来源链接', '来源核查状态']
        plan['fields'] = kept
        pub.call('view-set-visible-fields', '--view-id', plan['id'], body={'visible_fields': kept})
    current = pub.call('view-list')['views']
    name = '案例来源总览'
    found = next((v for v in current if v['name'] == name), None)
    if found is None:
        pub.call('view-create', body={'name': name, 'type': 'grid'})
        found = next(v for v in pub.call('view-list')['views'] if v['name'] == name)
    plan = {'name': name, 'id': found['id'], 'filter': {'logic': 'and', 'conditions': [['案例编号', 'non_empty']]},
            'fields': ['案例名称', '案例编号', '来源核查状态', '来源链接', '全部来源链接', '来源核查说明', '来源说明', '证据状态', '证据摘要']}
    pub.call('view-get-filter', '--view-id', plan['id'])
    pub.call('view-get-visible-fields', '--view-id', plan['id'])
    pub.call('view-get-sort', '--view-id', plan['id'])
    pub.call('view-set-filter', '--view-id', plan['id'], body=plan['filter'])
    pub.call('view-set-visible-fields', '--view-id', plan['id'], body={'visible_fields': plan['fields']})
    pub.call('view-set-sort', '--view-id', plan['id'], body={'sort_config': [{'field': '案例编号', 'desc': False}]})
    plans = [p for p in plans if p['name'] != name] + [plan]
    pub.dump(HERE / 'view-plan.json', plans)
    print('Source view:', plan['id'], flush=True)


if __name__ == '__main__':
    {'prepare': prepare, 'publish': publish, 'views': views, 'verify': pub.verify}[sys.argv[1]]()
