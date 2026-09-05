"""将用户补充的 41 条引用与逐页核查结果归档，并通过 CLI 发布。"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse
import publish_cases as pub

HERE = Path(__file__).resolve().parent
LIBRARY = HERE.parent / 'library.json'
RAW = Path('/Users/gpfs/.codex/attachments/4468dce8-17bf-47e6-a0ee-a59c480fdf2c/pasted-text.txt')
INPUT = Path('/tmp/brand-gemini-supplement-input.json')
AUDITS = [Path('/tmp') / f'brand-gemini-supplement-audit-{part}.json' for part in ('01-14', '15-28', '29-41')]
TABLE_NAME = '补充来源核查'
ACCESS = {'read': '已读正文', 'partial': '仅部分内容', 'unavailable': '未取得正文'}
RELEVANCE = {'case': '案例来源', 'method': '研究方法', 'mixed': '案例与方法', 'unrelated': '其他内容', 'unresolved': '待确认'}
SOURCE_FIELDS = ['来源链接', '来源说明', '来源核查状态', '全部来源链接', '来源核查说明', '报告差异', '证据摘要']
TABLE_COLUMNS = ['来源条目', '来源编号', '对应案例', '原清单归类', '原清单标题', '实际标题', '发布机构',
                 '发布日期', '原始链接', '核查页面', '读取状态', '用途判定', '可支持内容', '不能支持或缺口',
                 '标题核对', '核查结论', '同源关系', '核查日期']


def cli(command, *args, table=None, body=None, label=None):
    argv = ['lark-cli', 'base', '+' + command, '--base-token', pub.BASE, '--as', 'user']
    if table:
        argv += ['--table-id', table]
    argv += list(args)
    if body is not None:
        path = HERE / ('supplement-request-' + command + '.json')
        pub.dump(path, body)
        argv += ['--json', '@' + str(path.relative_to(pub.ROOT))]
    result = subprocess.run(argv, cwd=pub.ROOT, env=pub.ENV, capture_output=True, text=True)
    data = json.loads(result.stdout)
    if result.returncode or not data.get('ok'):
        raise RuntimeError(f'{command}: {result.stderr[:1000]} {data}')
    if label:
        pub.dump(HERE / (label + '.json'), data)
    return data['data']


def text_block(a):
    return '\n'.join([
        f'{a["id"]}｜{ACCESS[a["accessStatus"]]}｜{a.get("actualTitle") or "文章标题未能核对"}',
        f'{a.get("publisher") or "发布者未确认"}｜{a.get("publishedAt") or "发布日期未确认"}',
        '支持范围：' + ('；'.join(a['supports']) or '尚未取得支持正文'),
        '局限：' + '；'.join(a['limitations']),
        '核查结论：' + a['assessment'],
        a.get('readUrl') or a['providedUrl'],
    ])


def prepare():
    original = json.loads(INPUT.read_text())
    audits = sorted([a for p in AUDITS for a in json.loads(p.read_text())], key=lambda a: a['id'])
    assert len(original) == len(audits) == 41
    assert [a['id'] for a in original] == [a['id'] for a in audits]
    for backup, source in [(HERE / 'library-before-supplement.json', LIBRARY),
                           (HERE / 'case-rows-before-supplement.json', HERE / 'case-rows.json')]:
        if not backup.exists():
            shutil.copyfile(source, backup)
    library = json.loads((HERE / 'library-before-supplement.json').read_text())
    rows = json.loads((HERE / 'case-rows-before-supplement.json').read_text())
    cases = {c['id']: c for c in library['cases']}
    now = datetime.now(timezone.utc).isoformat()
    source_dir = HERE.parent / 'sources'
    raw_copy = source_dir / 'report-source-supplement.txt'
    shutil.copyfile(RAW, raw_copy)
    structured = source_dir / 'report-source-supplement.json'
    pub.dump(structured, original)
    library['sources'].append({
        'id': 'SRC-REFERENCE-SUPPLEMENT-20260905', 'kind': 'structured_dataset',
        'path': 'sources/report-source-supplement.json', 'url': None,
        'sha256': hashlib.sha256(structured.read_bytes()).hexdigest(),
        'lineageGroup': 'user-supplied-reference-list-20260905', 'status': 'read',
        'title': '用户补充的报告引用清单（41条）', 'importedAt': now,
        'notes': '记录用户提供的归类与标题，不视为独立网页证据；原文作者未单独确认。',
        'originalPath': 'sources/report-source-supplement.txt',
        'originalSha256': hashlib.sha256(raw_copy.read_bytes()).hexdigest(),
    })
    by_url = {s['url'].rstrip('/'): s for s in library['sources'] if s.get('url')}
    case_audits = {cid: [] for cid in cases}
    for item, a in zip(original, audits):
        assert item['url'] == a['providedUrl']
        assert set(a['caseIds']) <= set(cases)
        url = a.get('readUrl') or a['providedUrl']
        known = by_url.get(url.rstrip('/'))
        if known is None:
            known = {
                'id': 'SRC-SUPPLEMENT-' + a['id'], 'kind': a['kind'], 'path': None,
                'url': url, 'sha256': None,
                'lineageGroup': a.get('lineageGroup') or url,
                'status': 'read' if a['accessStatus'] == 'read' else 'registered',
                'title': a.get('actualTitle') or '未核对标题：' + item['providedEntry'],
                'publisher': a.get('publisher'), 'publishedAt': a.get('publishedAt'),
                'importedAt': now, 'notes': a['assessment'],
            }
            library['sources'].append(known)
            by_url[url.rstrip('/')] = known
        a['sourceId'] = known['id']
        known['supplementAudit'] = {k: a[k] for k in ('id', 'accessStatus', 'titleMismatch', 'assessment')}
        known['providedUrls'] = list(dict.fromkeys(known.get('providedUrls', []) + [a['providedUrl']]))
        for cid in a['caseIds']:
            case = cases[cid]
            case_audits[cid].append(a)
            case.setdefault('sourceAudits', []).append({
                'sourceId': known['id'], 'auditId': a['id'], 'accessStatus': a['accessStatus'],
                'checkedAt': a['readAt'], 'supportedScope': a['supports'],
                'limitations': a['limitations'], 'assessment': a['assessment'],
            })
            if not any(r['sourceId'] == known['id'] for r in case['sourceRefs']):
                case['sourceRefs'].append({'sourceId': known['id'], 'locator': a.get('actualTitle') or item['providedEntry']})
            case['candidateUrls'] = list(dict.fromkeys(case['candidateUrls'] + [a['providedUrl'], url]))
            if a['accessStatus'] == 'read' and not any(r['sourceId'] == known['id'] for r in case.get('sourceReadings', [])):
                case.setdefault('sourceReadings', []).append({
                    'sourceId': known['id'], 'checkedAt': a['readAt'],
                    'supportedScope': a['supports'], 'limitations': a['limitations'],
                    'claimReview': '来源已读；各项复合断言仍须逐条核验，保留原状态。',
                })
        if a['id'] in {'GS06', 'GS35', 'GS37', 'GS39', 'GS40', 'GS41'}:
            library['methods'].append({
                'id': 'M-SOURCE-' + a['id'], 'kind': 'source_reference',
                'title': a.get('actualTitle') or item['providedEntry'],
                'adoptionStatus': 'reference_only_pending_context',
                'sourceAccess': a['accessStatus'], 'summary': a['supports'],
                'notes': '；'.join(a['limitations']),
                'sourceRefs': [{'sourceId': known['id'], 'locator': a.get('actualTitle') or item['providedEntry']}],
            })

    # 同一新华社原稿及中消协表态在前轮和本轮之间也保留同源关系。
    for source in library['sources']:
        if source.get('url') == 'https://www.news.cn/20240401/b936011ca110442b891c2373b1e16216/c.html':
            source['lineageGroup'] = 'xinhua-panqing-20240331-china-ip-licensing'
        if source.get('url') == 'https://cpc.people.com.cn/n1/2022/0113/c64387-32330256.html':
            source['lineageGroup'] = 'cca-20220112-kfc-dimoo-commentary'
    sources = {s['id']: s for s in library['sources']}
    by_audit = {a['id']: a for a in audits}
    lv = by_audit['GS07']
    lv_note = '补充核查GS07：虎嗅转载LADYMAX确有“系列销售额达到1亿美元”的媒体表述；无原始财务文件、期间和渠道，不能支持“直营销售额超过1亿美元”这一完整说法。'
    claim = next(c for c in cases['C11']['claims'] if c['id'] == 'C11-GEM-04')
    claim['verification'].append({'sourceId': lv['sourceId'], 'locator': lv['actualTitle'] + '中2017年LV合作及1亿美元段落',
                                  'checkedAt': lv['readAt'], 'conclusion': 'inconclusive', 'notes': lv_note})
    conflict = next(c for c in library['conflicts'] if c['id'] == 'DIFF-03')
    conflict['note'] += '\n' + lv_note
    conflict['sourceRefs'].append({'sourceId': lv['sourceId'], 'locator': lv['actualTitle'] + '中LV合作段落'})

    for row in rows:
        f = row['fields']; cid = f['案例编号']; relevant = case_audits[cid]
        if not relevant:
            continue
        case = cases[cid]
        read_sources = [(r, sources[r['sourceId']]) for r in case.get('sourceReadings', [])]
        read_urls = set()
        blocks = []
        for reading, source in read_sources:
            read_urls.update(u.rstrip('/') for u in [source['url'], *source.get('providedUrls', [])])
            blocks.append(f'【已读正文】{source.get("publisher") or urlparse(source["url"]).netloc}｜{source.get("publishedAt") or "日期未标明"}｜{source["title"]}\n{source["url"]}')
        partial = {a['providedUrl'].rstrip('/'): a for a in relevant if a['accessStatus'] != 'read'}
        for url in case['candidateUrls']:
            if url.rstrip('/') in read_urls:
                continue
            a = partial.get(url.rstrip('/'))
            label = ACCESS[a['accessStatus']] if a else '报告链接，尚未逐页核查'
            blocks.append(f'【{label}】{urlparse(url).netloc}\n{url}')
        f['全部来源链接'] = '\n\n'.join(blocks)
        if read_sources:
            f['来源核查状态'] = '已读外部正文（限定范围）'
            if not cases[cid].get('sourceReadings') or f['来源核查说明'].startswith('已完整恢复原报告'):
                f['来源核查说明'] = ''
            # 首轮只是线索的主链接，改为本轮实际读取且对应的来源。
            before = next(r['fields'] for r in json.loads((HERE / 'case-rows-before-supplement.json').read_text()) if r['fields']['案例编号'] == cid)
            if before['来源核查状态'] != '已读外部正文（限定范围）':
                f['来源链接'] = read_sources[0][1]['url']
        additions = '\n\n'.join(text_block(a) for a in relevant)
        f['来源核查说明'] = (f['来源核查说明'] + '\n\n用户补充清单逐页核查：\n' + additions).strip()
        f['来源说明'] += '\n用户补充的41条引用清单：' + '、'.join(a['id'] for a in relevant) + '；原始归类和标题与实际页面分别保留，详见“补充来源核查”表。'
        if cid == 'C11':
            f['报告差异'] += '\n' + lv_note
            f['证据摘要'] += '\n[C11-GEM-04 补充核查｜inconclusive] ' + lv_note
        if cid == 'C46':
            f['来源核查说明'] += '\n口径提醒：GS29/GS30区分联名杯与宣传撤下、饮品改名后继续销售；不要把它们一概写成饮品配方全部停售。'

    audit_rows = []
    for item, a in zip(original, audits):
        audit_rows.append({'fields': {
            '来源条目': a['id'] + ' · ' + (a.get('actualTitle') or '待确认文章'),
            '来源编号': a['id'],
            '对应案例': '\n'.join(cid + '｜' + cases[cid]['title'] for cid in a['caseIds']) or ('方法资料／待归案，未强行挂接现有案例'),
            '原清单归类': item['part'] + '／' + item['section'], '原清单标题': item['providedEntry'],
            '实际标题': a.get('actualTitle'), '发布机构': a.get('publisher'), '发布日期': a.get('publishedAt'),
            '原始链接': a['providedUrl'], '核查页面': a.get('readUrl'), '读取状态': ACCESS[a['accessStatus']],
            '用途判定': RELEVANCE[a['relevance']], '可支持内容': '\n'.join(a['supports']) or '尚未取得支持正文',
            '不能支持或缺口': '\n'.join(a['limitations']),
            '标题核对': '未能核对' if a['titleMismatch'] is None else ('标题有改写' if a['titleMismatch'] else '基本一致'),
            '核查结论': a['assessment'], '同源关系': sources[a['sourceId']]['lineageGroup'], '核查日期': a['readAt'][:10],
        }})
    library['revision'] += 1
    library['updatedAt'] = now
    staged = LIBRARY.with_name('library-supplement-staged.json')
    pub.dump(staged, library)
    subprocess.run([sys.executable, str(pub.ROOT / 'brand-case-research/scripts/case_library.py'), 'validate', str(staged)], check=True)
    staged.replace(LIBRARY)
    pub.dump(HERE / 'supplement-audit.json', audits)
    pub.dump(HERE / 'supplement-audit-rows.json', audit_rows)
    pub.dump(HERE / 'case-rows.json', rows)
    pub.dump(HERE / 'supplement-case-ids.json', [cid for cid, arr in case_audits.items() if arr])
    pub.dump(HERE / 'supplement-unmapped.json', [a for a in audits if not a['caseIds']])
    print('Prepared', len(audits), 'citations; cases updated:', sum(bool(a) for a in case_audits.values()), flush=True)


def publish_cases():
    pub.call('field-list')
    current = {r['fields']['案例编号']: r for r in pub.records()}
    baseline = {r['fields']['案例编号']: r['fields'] for r in json.loads((HERE / 'supplement-records-before.json').read_text())}
    for row in pub.inputs():
        f = row['fields']; cid = f['案例编号']; r = current[cid]
        patch = {name: f[name] for name in SOURCE_FIELDS if r['fields'].get(name) != f[name]}
        for name in patch:
            if r['fields'].get(name) != baseline[cid].get(name):
                raise RuntimeError('Remote changed; inspect ' + cid + '/' + name)
        if patch:
            pub.call('record-upsert', '--record-id', r['id'], body=patch, label='supplement-case-' + cid)
            print('Updated case:', cid, flush=True)


def publish_audit():
    rows = json.loads((HERE / 'supplement-audit-rows.json').read_text())
    saved = HERE / 'supplement-table.json'
    tables = cli('table-list')['tables']
    if saved.exists():
        table = json.loads(saved.read_text())['id']
        assert any(t['id'] == table and t['name'] == TABLE_NAME for t in tables)
    else:
        if any(t['name'] == TABLE_NAME for t in tables):
            raise RuntimeError('Table name already in use; inspect existing table before writing')
        schema = []
        for name in TABLE_COLUMNS:
            field = {'name': name, 'type': 'text'}
            if name in ('原始链接', '核查页面'):
                field['style'] = {'type': 'url'}
            if name in ('读取状态', '用途判定', '标题核对'):
                options = list(dict.fromkeys(r['fields'][name] for r in rows))
                field.update(type='select', multiple=False, options=[{'name': v} for v in options])
            schema.append(field)
        cli('table-create', '--name', TABLE_NAME, '--fields', json.dumps(schema, ensure_ascii=False))
        table = next(t['id'] for t in cli('table-list')['tables'] if t['name'] == TABLE_NAME)
        pub.dump(saved, {'id': table, 'name': TABLE_NAME})
    cli('field-list', table=table, label='supplement-audit-fields')
    existing = cli('record-list', '--format', 'json', '--limit', '200', table=table)
    assert not existing.get('has_more')
    seen = {}
    empty = []
    for rid, values in zip(existing['record_id_list'], existing['data']):
        f = dict(zip(existing['fields'], values))
        if f.get('来源编号'):
            seen[f['来源编号']] = rid
        elif all(v in (None, '', []) for v in values):
            empty.append(rid)
        else:
            raise RuntimeError('Unrecognized audit row; inspect before writing')
    pending = [r for r in rows if r['fields']['来源编号'] not in seen]
    for rid, row in zip(empty, pending):
        cli('record-upsert', '--record-id', rid, table=table, body=row['fields'])
    pending = pending[len(empty):]
    if pending:
        cli('record-batch-create', table=table, body={'fields': TABLE_COLUMNS, 'rows': [[r['fields'][n] for n in TABLE_COLUMNS] for r in pending]}, label='supplement-audit-created')
    views = cli('view-list', table=table)['views']
    main = views[0]['id']
    cli('view-get', '--view-id', main, table=table)
    cli('view-rename', '--view-id', main, '--name', '全部补充来源', table=table)
    columns = ['来源条目', '来源编号', '对应案例', '读取状态', '原始链接', '核查页面', '实际标题', '发布机构', '核查结论', '可支持内容', '不能支持或缺口', '原清单标题', '发布日期', '同源关系']
    cli('view-get-visible-fields', '--view-id', main, table=table)
    cli('view-set-visible-fields', '--view-id', main, table=table, body={'visible_fields': columns})
    cli('view-get-sort', '--view-id', main, table=table)
    cli('view-set-sort', '--view-id', main, table=table, body={'sort_config': [{'field': '来源编号', 'desc': False}]})
    url = f'https://bcnzyor8juhy.feishu.cn/wiki/MEBWwPiQYiNldskDXtRc8aLOnrd?table={table}&view={main}'
    pub.dump(saved, {'id': table, 'name': TABLE_NAME, 'viewId': main, 'url': url, 'visibleFields': columns})
    print('Published audit table:', url, flush=True)


def verify_audit():
    table = json.loads((HERE / 'supplement-table.json').read_text())
    projection = [arg for name in TABLE_COLUMNS for arg in ('--field-id', name)]
    data = cli('record-list', '--format', 'json', '--limit', '200', '--view-id', table['viewId'], *projection, table=table['id'])
    assert not data.get('has_more') and len(data['data']) == 41
    expected = {r['fields']['来源编号']: r['fields'] for r in json.loads((HERE / 'supplement-audit-rows.json').read_text())}
    import re
    ids = []
    for values in data['data']:
        f = dict(zip(data['fields'], values)); cid = f['来源编号']; ids.append(cid)
        for name in TABLE_COLUMNS:
            got = f.get(name)
            if name in ('读取状态', '用途判定', '标题核对') and isinstance(got, list):
                got = got[0] if got else None
            if name in ('原始链接', '核查页面') and isinstance(got, str):
                match = re.fullmatch(r'\[[^\]]*\]\((.+)\)', got)
                if match:
                    got = match.group(1)
            assert got == expected[cid][name] or got in (None, '') and expected[cid][name] in (None, ''), (cid, name, got)
    assert ids == sorted(expected)
    visible = cli('view-get-visible-fields', '--view-id', table['viewId'], table=table['id'])['visible_fields']
    assert visible == table['visibleFields']
    pub.dump(HERE / 'supplement-audit-readback.json', data)
    pub.dump(HERE / 'supplement-verified.json', {'status': 'verified', 'rows': 41, 'fields': len(TABLE_COLUMNS), 'verifiedCells': 41 * len(TABLE_COLUMNS), 'verifiedAt': datetime.now(timezone.utc).isoformat(), 'url': table['url']})
    print('Verified 41 source rows,', 41 * len(TABLE_COLUMNS), 'cells', flush=True)


if __name__ == '__main__':
    {'prepare': prepare, 'cases': publish_cases, 'audit': publish_audit, 'verify': verify_audit}[sys.argv[1]]()
