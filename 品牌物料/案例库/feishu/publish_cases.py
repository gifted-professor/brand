"""本次品牌案例发布工具。所有飞书读写都通过 lark-cli，按阶段显式执行。"""
from pathlib import Path
import subprocess, json, os, sys, re
from datetime import datetime, timezone

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
BASE='AD5Wb4NfqaBPGfsgTLIch6HMnbb'
TABLE='tblwmdPy5ZfPyEo4'
MAIN_VIEW='vewnDL38Qy'
PRIMARY='fldw0Qlxyd'
ENV={**os.environ,'LARKSUITE_CLI_NO_UPDATE_NOTIFIER':'1','LARKSUITE_CLI_NO_SKILLS_NOTIFIER':'1'}

DESCRIPTIONS={
 '案例名称':'历史合作项目名称。研究案例不代表本团队已经完成商业合作或视觉成品。',
 '案例编号':'本地案例库稳定编号，导入查重依据。',
 '品牌A':'原案例参与方，不代表已确认的本项目合作方。',
 '品牌B或合作方':'原案例其他参与方，可能涉及品牌、IP、设计师或组织。',
 '合作类型':'保留原资料的合作模式，区分联名、授权、渠道联盟、技术共研等。',
 '时间范围':'原报告描述的项目时间范围，不是本次核验日期。',
 '主要市场':'原报告描述的市场范围。',
 '原报告结果分类':'沿用报告分类，不能替代本库逐条核验；销售表现不等于双方盈利。',
 '参考用途':'本次研究给案例的用途标签，不是商业成败裁决。',
 '研究处理状态':'已跑通指本地检索、资料包生成、迁移分析或数字审核；不表示真实生图或商业落地。',
 '证据状态':'本轮实际核验状态。只有 C01 的指定历史销售披露有官网支持，其余仍待核验。',
 '案例产物':'历史产物线索，真实性以证据摘要为准，不能自动成为当前可用素材。',
 '提取机制':'研究分析：双方资源如何形成消费者价值，不能直接当作因果证明。',
 '风险与反面教训':'报告风险解释与反例线索；历史风险不自动构成当前项目结论。',
 '示例任务':'已实际试用的研究场景；不等于已确认的真实品牌项目。',
 '迁移做法':'本次试用提取的可迁移假设，需结合当前 brief 和资源确认。',
 '不宜照搬':'历史案例与示例任务的差异，含不能直接沿用的物料、数字或能力。',
 '适用约束':'示例中的硬条件及待确认条件，不给其他项目自动增加限制。',
 '待补证':'未公开或尚未核对的数据、成本、利润、权利和因果证据。',
 '可供Skill':'资料可供哪些能力参考，不代表这些能力都已在此案例上实际执行。',
 '来源说明':'资料所属报告、来源家族和定位；同源转述不算独立核验。',
 '来源链接':'优先显示已经读取正文的案例来源；全部链接见“全部来源链接”，具体读取情况见“来源核查状态”和“来源核查说明”。',
 '报告差异':'GPT 与 Gemini 尚未解决的证据、时间或口径差异，不是已判定报告错误。',
 '证据摘要':'按断言列出状态与核验范围，原报告标签不自动升级为事实。',
 '来源核查状态':'区分已读取外部正文、仅原报告链接、尚缺外部链接；页面已读取不等于案例内全部数字或因果已核验。',
 '全部来源链接':'保留报告的全部外部链接，并补充本轮读取的案例来源；每条注明读取或待查属性。',
 '来源核查说明':'已读来源的标题、发布者、日期、支持范围和局限；未读取的原报告链接明确标注。',
}
ORDER=list(DESCRIPTIONS)
MULTI={'参考用途','可供Skill'}
SINGLE={'原报告结果分类','研究处理状态','证据状态','来源核查状态'}

def dump(path,data):
 path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def call(command,*args,body=None,label=None):
 argv=['lark-cli','base','+'+command,'--base-token',BASE,'--table-id',TABLE,'--as','user',*args]
 if body is not None:
  serialized=json.dumps(body,ensure_ascii=False)
  if len(serialized.encode('utf-8'))>50000:
   request_file=HERE/('request-'+command+'.json');dump(request_file,body)
   argv+=['--json','@'+str(request_file.relative_to(ROOT))]
  else:argv+=['--json',serialized]
 result=subprocess.run(argv,cwd=ROOT,env=ENV,capture_output=True,text=True)
 try:envelope=json.loads(result.stdout)
 except json.JSONDecodeError:
  raise RuntimeError(f'{command} exit={result.returncode}: {result.stderr[:1800]} {result.stdout[:800]}')
 if result.returncode or not envelope.get('ok'):
  raise RuntimeError(f'{command} failed: {json.dumps(envelope,ensure_ascii=False)} {result.stderr[:1200]}')
 if label:dump(HERE/(label+'.json'),envelope)
 return envelope['data']

def records():
 rows=[];offset=0
 while True:
  data=call('record-list','--format','json','--limit','200','--offset',str(offset))
  fields=data['fields']
  for rid,values in zip(data['record_id_list'],data['data']):
   normalized={}
   for name,value in zip(fields,values):
    # CLI reads single-selects as arrays and URL cells as Markdown links.
    if name in SINGLE and isinstance(value,list) and len(value)<=1:value=value[0] if value else None
    if name=='来源链接' and isinstance(value,str):
     link=re.fullmatch(r'\[[^\]]*\]\((.+)\)',value)
     if link:value=link.group(1)
    normalized[name]=value
   rows.append({'id':rid,'fields':normalized})
  if not data.get('has_more'):return rows
  if not data['record_id_list']:raise RuntimeError('Empty paginated response')
  offset+=len(data['record_id_list'])

def inputs():
 rows=json.loads((HERE/'case-rows.json').read_text())
 assert len(rows)==67 and len({r['fields']['案例编号'] for r in rows})==67
 assert all(set(r['fields'])==set(ORDER) for r in rows)
 return rows

def prepare():
 rows=inputs();schema=[]
 colors={'已跑通迁移分析':'Green','已跑通数字审核':'Purple','已跑通证据包生成':'Blue','已整理可检索':'Gray','待核验':'Orange','部分断言有来源支持':'Green','风险反例':'Red','机制参考':'Blue','结果口径核对':'Orange'}
 for name in ORDER:
  field={'name':name,'type':'text','description':DESCRIPTIONS[name]}
  if name in MULTI|SINGLE:
   vals=[]
   for row in rows:
    v=row['fields'][name]
    vals.extend(v if name in MULTI else [v])
   options=list(dict.fromkeys(v for v in vals if v))
   field.update(type='select',multiple=name in MULTI,options=[{'name':v,'hue':colors.get(v,'Blue'),'lightness':'Lighter'} for v in options])
  if name=='来源链接':field['style']={'type':'url'}
  schema.append(field)
 dump(HERE/'field-schema.json',schema)
 print('Prepared',len(rows),'cases and',len(schema),'fields',flush=True)

def fields():
 schema=json.loads((HERE/'field-schema.json').read_text())
 current=call('field-list',label='fields-before')
 before=records();dump(HERE/'records-before.json',before)
 names={f['name']:f for f in current['fields']}
 if '案例名称' not in names:
  existing=call('field-get','--field-id',PRIMARY)['field']
  if existing['name']!='文本' or existing['type']!='text':raise RuntimeError('Unexpected primary column')
  if any(row['fields'].get('文本') is not None for row in before):raise RuntimeError('Primary column no longer empty')
  call('field-update','--field-id',PRIMARY,'--yes',body={**schema[0],'style':{'type':'plain'}},label='primary-renamed')
  names['案例名称']={'id':PRIMARY}
 for f in schema:
  if f['name'] in names:continue
  response=call('field-create',body=f,label='field-'+str(ORDER.index(f['name'])))
  print('Created field:',f['name'],flush=True)
 current=call('field-list',label='fields-after')
 actual={f['name']:f for f in current['fields']}
 for f in schema:
  assert actual[f['name']]['type']==f['type']
  if f['type']=='select':assert actual[f['name']].get('multiple',False)==f['multiple']
 print('Verified',len(schema),'field types',flush=True)

def write_rows():
 rows=inputs();current=records();by_id={r['fields'].get('案例编号'):r for r in current if r['fields'].get('案例编号')}
 pending=[r for r in rows if r['fields']['案例编号'] not in by_id]
 for row in rows:
  found=by_id.get(row['fields']['案例编号'])
  if found and any(found['fields'].get(k)!=v for k,v in row['fields'].items()):
   raise RuntimeError('Existing case differs; inspect before replacing: '+row['fields']['案例编号'])
 empty=[r for r in current if all(v is None or v=='' or v==[] for v in r['fields'].values())]
 used=[]
 for old,row in zip(empty,pending):
  # Re-check the exact empty record immediately before reusing it.
  fresh=call('record-get','--record-id',old['id'],'--format','json')
  dump(HERE/('empty-'+old['id']+'.json'),fresh)
  if len(fresh['data'])!=1 or any(v is not None and v!='' and v!=[] for v in fresh['data'][0]):
   raise RuntimeError('Empty record changed; no overwrite: '+old['id'])
  call('record-upsert','--record-id',old['id'],body=row['fields'],label='record-'+row['fields']['案例编号'])
  used.append(row['fields']['案例编号']);print('Filled empty row:',used[-1],flush=True)
 pending=[r for r in pending if r['fields']['案例编号'] not in used]
 if pending:
  payload={'fields':ORDER,'rows':[[r['fields'][name] for name in ORDER] for r in pending]}
  dump(HERE/'batch-create-payload.json',payload)
  response=call('record-batch-create',body=payload,label='batch-created')
  assert len(response['record_id_list'])==len(pending)
  print('Created new rows:',len(pending),flush=True)
 print('Record write completed',flush=True)

def views():
 current=call('view-list',label='views-before')
 existing={v['name']:v['id'] for v in current['views']}
 plans=[
  {'name':'已跑通资料示例','id':MAIN_VIEW,'filter':{'logic':'and','conditions':[['研究处理状态','intersects',['已跑通迁移分析','已跑通数字审核','已跑通证据包生成']]]},'fields':['案例名称','案例编号','研究处理状态','示例任务','参考用途','提取机制','迁移做法','不宜照搬','适用约束','风险与反面教训','证据状态','可供Skill']},
  {'name':'全部案例库','filter':{'logic':'and','conditions':[['案例编号','non_empty']]},'fields':['案例名称','案例编号','合作类型','时间范围','参考用途','研究处理状态','证据状态','案例产物','提取机制','风险与反面教训','可供Skill','来源链接']},
  {'name':'反面与风险案例','filter':{'logic':'and','conditions':[['参考用途','intersects',['风险反例']]]},'fields':['案例名称','案例编号','原报告结果分类','风险与反面教训','提取机制','不宜照搬','适用约束','待补证','证据状态','来源链接']},
  {'name':'提取机制','filter':{'logic':'and','conditions':[['案例编号','non_empty']]},'fields':['案例名称','案例编号','合作类型','案例产物','提取机制','迁移做法','不宜照搬','可供Skill','证据状态']},
  {'name':'报告差异与核验','filter':{'logic':'and','conditions':[['报告差异','non_empty']]},'fields':['案例名称','案例编号','报告差异','证据状态','证据摘要','待补证','来源说明','来源链接']},
 ]
 saved_plan=HERE/'view-plan.json'
 if saved_plan.exists():
  saved=json.loads(saved_plan.read_text())
  if any(p['name']=='案例来源总览' for p in saved):plans=saved
 for plan in plans:
  if plan.get('id'):
   # The user-linked main view was read before changing its configuration.
   call('view-get','--view-id',plan['id'])
   call('view-rename','--view-id',plan['id'],'--name',plan['name'])
  elif plan['name'] in existing:plan['id']=existing[plan['name']]
  else:
   call('view-create',body={'name':plan['name'],'type':'grid'},label='created-view-'+str(plans.index(plan)))
   refreshed=call('view-list')['views']
   matches=[v for v in refreshed if v['name']==plan['name']]
   if len(matches)!=1:raise RuntimeError('View name is not unique: '+plan['name'])
   plan['id']=matches[0]['id']
  vid=plan['id']
  call('view-get-filter','--view-id',vid)
  call('view-get-visible-fields','--view-id',vid)
  call('view-get-sort','--view-id',vid)
  call('view-set-filter','--view-id',vid,body=plan['filter'])
  call('view-set-visible-fields','--view-id',vid,body={'visible_fields':plan['fields']})
  call('view-set-sort','--view-id',vid,body={'sort_config':[{'field':'案例编号','desc':False}]})
  print('Configured view:',plan['name'],vid,flush=True)
 dump(HERE/'view-plan.json',plans)

def verify():
 expected={r['fields']['案例编号']:r['fields'] for r in inputs()}
 rows=records();actual={r['fields'].get('案例编号'):r for r in rows if r['fields'].get('案例编号')}
 if len(actual)!=67 or len(rows)!=67:raise RuntimeError('Unexpected records or duplicate case IDs')
 errors=[]
 for cid,fields in expected.items():
  if cid not in actual:errors.append({'case':cid,'error':'missing'});continue
  for name,value in fields.items():
   got=actual[cid]['fields'].get(name)
   if isinstance(value,list):same=isinstance(got,list) and sorted(value)==sorted(got)
   else:same=got==value or (got in (None,'') and value in (None,''))
   if not same:errors.append({'case':cid,'field':name,'expected':value,'actual':got})
 dump(HERE/'record-readback.json',rows)
 if errors:
  dump(HERE/'readback-errors.json',errors)
  raise RuntimeError(str(len(errors))+' cells differ; see readback-errors.json')
 plans=json.loads((HERE/'view-plan.json').read_text());view_results=[]
 for plan in plans:
  filter_state=call('view-get-filter','--view-id',plan['id'])
  visible=call('view-get-visible-fields','--view-id',plan['id'])
  data=call('record-list','--view-id',plan['id'],'--field-id','案例编号','--limit','200','--format','json')
  if data.get('has_more'):raise RuntimeError('View verification not exhaustive')
  ids=[row[0] for row in data['data']]
  expected_ids=sorted(cid for cid,f in expected.items() if (
   plan['name'] in ('全部案例库','提取机制','案例来源总览')
   or plan['name']=='已跑通资料示例' and f['研究处理状态'].startswith('已跑通')
   or plan['name']=='反面与风险案例' and '风险反例' in f['参考用途']
   or plan['name']=='报告差异与核验' and bool(f['报告差异'])
  ))
  if ids!=expected_ids:raise RuntimeError('View membership/order mismatch: '+plan['name'])
  if visible['visible_fields']!=plan['fields']:raise RuntimeError('View columns mismatch: '+plan['name'])
  view_results.append({'name':plan['name'],'id':plan['id'],'count':len(ids),'caseIds':ids,'filter':filter_state,'visibleFields':visible['visible_fields'],'url':f'https://bcnzyor8juhy.feishu.cn/wiki/MEBWwPiQYiNldskDXtRc8aLOnrd?table={TABLE}&view={plan["id"]}'})
 manifest={'verifiedAt':datetime.now(timezone.utc).isoformat(),'baseToken':BASE,'tableId':TABLE,'tableName':'demo 案例','records':len(rows),'fields':len(ORDER),'verifiedCells':len(rows)*len(ORDER),'views':view_results,'recordIds':{cid:r['id'] for cid,r in actual.items()},'scope':'已跑通仅指资料检索、证据包、迁移分析和数字审核。','status':'verified'}
 dump(HERE/'publish-manifest.json',manifest)
 print(json.dumps({k:v for k,v in manifest.items() if k!='recordIds'},ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':
 mode=sys.argv[1]
 {'prepare':prepare,'fields':fields,'records':write_rows,'views':views,'verify':verify}[mode]()
