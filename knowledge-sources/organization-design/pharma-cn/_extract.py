#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract official pharma-cn regulation raws into annotated markdown knowledge docs."""
import re, html, os, hashlib, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(BASE, 'raw')
TODAY = '2026-08-04'

def html_lines(path):
    t = open(path, encoding='utf-8', errors='ignore').read()
    t = re.sub(r'<script.*?</script>', '', t, flags=re.S | re.I)
    t = re.sub(r'<style.*?</style>', '', t, flags=re.S | re.I)
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'<[^>]+>', '\n', t)
    t = html.unescape(t)
    return [l.strip() for l in t.split('\n') if l.strip()]

def txt_lines(path):
    return [l.strip() for l in open(path, encoding='utf-8').read().split('\n') if l.strip()]

CN = r'一二三四五六七八九十百千万零两'
ART = re.compile(rf'^第[{CN}]+条')
CHAP = re.compile(rf'^第[{CN}]+章')
SEC = re.compile(rf'^第[{CN}]+节')
ITEM = re.compile(r'^[一二三四五六七八九十]+、')

def format_body(lines, start_pred, end_pred):
    """Slice [start,end) then format chapters/sections/articles."""
    s = next(i for i, l in enumerate(lines) if start_pred(l))
    e = next(i for i in range(len(lines) - 1, s, -1) if end_pred(lines[i])) + 1
    body = lines[s:e]
    out, i = [], 0
    while i < len(body):
        l = body[i]
        l = re.sub(r'\u3000+', '　', l)
        if CHAP.match(l):
            out.append('\n## ' + l)
        elif SEC.match(l):
            out.append('\n### ' + l)
        elif ITEM.match(l):
            out.append('\n## ' + l)
        elif ART.match(l):
            label = l
            rest = ''
            m = re.match(rf'^(第[{CN}]+条)\s*[　 ]?(.*)$', l)
            if m:
                label, rest = m.group(1), m.group(2)
            if not rest and i + 1 < len(body):
                rest = body[i + 1]; i += 1
            out.append('\n**' + label + '**　' + rest)
        else:
            out.append(l)
        i += 1
    return '\n'.join(out)

def annotate(body, keywords):
    """Mark articles/items containing org-design keywords; return (body, hits)."""
    hits = []
    lines = body.split('\n')
    ctx = ''
    for idx, l in enumerate(lines):
        mh = re.match(r'^##+\s*(.+)', l)
        if mh:
            ctx = mh.group(1).strip()
        m = re.match(r'^\*\*(第[' + CN + r']+条)\*\*', l)
        if m:
            ctx = m.group(1)
        key = None
        if m:
            for kw in keywords:
                if kw in l:
                    key = kw; break
            if key:
                lines[idx] = l.replace('**' + m.group(1) + '**',
                                       '**' + m.group(1) + '**【组织设计相关】', 1)
                hits.append((m.group(1), key))
        elif l.strip().startswith('（'):
            for kw in keywords:
                if kw in l:
                    key = kw; break
            if key:
                num = l.strip().split('）')[0] + '）'
                lines[idx] = '【组织设计相关】' + l
                hits.append((ctx + num, key))
        elif l.strip() and not l.startswith(('>', '#', '---')):
            for kw in keywords:
                if kw in l:
                    key = kw; break
            if key:
                lines[idx] = '【组织设计相关】' + l
                hits.append((ctx + '(续行)', key))
    return '\n'.join(lines), hits

FM = '''---
docId: "{docId}"
title: "{title}"
sourceType: "regulation"
author_or_issuer: "{issuer}"
edition_or_version: "{edition}"
publication_date: "{pub}"
effective_date: "{eff}"
document_number: "{num}"
source_url: "{url}"
license_or_terms: "官方立法/行政文件,依《著作权法》第五条不适用著作权"
language: "zh"
retrieved_at: "{today}"
correctedBy: "machine-extract,unreviewed"
reviewed: false
layer: "pharma_context"
---
'''

DOCS = [
    dict(
        docId='cn-drug-admin-law-2019',
        title='中华人民共和国药品管理法（2019年修订）',
        issuer='全国人民代表大会常务委员会（中华人民共和国主席令公布）',
        edition='2019年8月26日第二次修订（现行有效）',
        pub='2019-08-26', eff='2019-12-01',
        num='中华人民共和国主席令第三十一号',
        url='http://www.npc.gov.cn/npc/c2/c30834/201908/t20190826_300489.html',
        raw='drug-admin-law-2019_npc.html', kind='html',
        start=lambda l: '1984年9月20日第六届' in l,
        end=lambda l: '本法自2019年12月1日起施行' in l,
        header='中华人民共和国药品管理法',
        keywords=['上市许可持有人', '质量受权人', '委托生产', '委托经营', '组织机构', '质量管理体系', '药物警戒'],
    ),
    dict(
        docId='cn-drug-admin-law-implementing-reg-2026',
        title='中华人民共和国药品管理法实施条例（2026年修订）',
        issuer='国务院',
        edition='2026年1月16日第四次修订公布（现行有效）',
        pub='2026-01-16', eff='2026-05-15',
        num='中华人民共和国国务院令第828号',
        url='https://www.gov.cn/gongbao/2026/issue_12546/202602/content_7057461.html',
        raw='drug-admin-law-reg-2026_govcn.html', kind='html',
        start=lambda l: l.startswith('（2002年8月4日'),
        end=lambda l: ('施行' in l and ART.match(l)) or l.startswith('本条例自'),
        header='中华人民共和国药品管理法实施条例（国务院令第828号，2026年第四次修订，自2026年5月15日起施行）',
        keywords=['上市许可持有人', '质量受权人', '委托生产', '委托经营', '组织机构', '质量管理体系', '质量管理机构', '药物警戒'],
    ),
    dict(
        docId='cn-gmp-2010',
        title='药品生产质量管理规范（2010年修订）',
        issuer='卫生部（令文公布）；国家市场监督管理总局规章库收录',
        edition='2010年修订（现行有效）',
        pub='2011-01-17', eff='2011-03-01',
        num='中华人民共和国卫生部令第79号',
        url='https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2023/art_d5e1dbaa8f284277a5f6c3e2fc840d00.html',
        raw='gmp-2010_samr.html', kind='html',
        start=lambda l: l.startswith('（2011年1月17日卫生部令第79号'),
        end=lambda l: '本规范自2011年3月1日起施行' in l,
        header='药品生产质量管理规范（2010年修订）（卫生部令第79号）',
        keywords=['质量管理部门', '质量受权人', '关键人员', '质量管理负责人', '生产管理负责人', '组织机构'],
    ),
    dict(
        docId='cn-mah-contract-mfg-supervision-2023-132',
        title='国家药监局关于加强药品上市许可持有人委托生产监督管理工作的公告',
        issuer='国家药品监督管理局',
        edition='2023年发布（现行有效）',
        pub='2023-10-17', eff='2023-10-17',
        num='国家药监局公告2023年第132号',
        url='https://www.nmpa.gov.cn/xxgk/fgwj/xzhgfxwj/20231023160426145.html',
        raw='mah-contract-mfg-2023-132_nmpa.txt', kind='txt',
        start=lambda l: l.startswith('为进一步落实药品上市许可持有人'),
        end=lambda l: l.startswith('2023年10月17日'),
        header='国家药监局关于加强药品上市许可持有人委托生产监督管理工作的公告（2023年第132号）',
        keywords=['组织机构', '关键岗位', '质量受权人', '质量协议', '管理部门', '质量管理体系', '主体责任', '驻厂', '派员'],
    ),
    dict(
        docId='cn-contract-mfg-entrusted-2025-134',
        title='国家药监局关于加强药品受托生产监督管理工作的公告',
        issuer='国家药品监督管理局',
        edition='2025年发布（现行有效）',
        pub='2025-12-30', eff='2025-12-30',
        num='国家药监局公告2025年第134号',
        url='https://www.nmpa.gov.cn/xxgk/fgwj/xzhgfxwj/20260106115318178.html',
        raw='contract-mfg-entrusted-2025-134_nmpa.txt', kind='txt',
        start=lambda l: l.startswith('为进一步加强上市药品委托生产监管'),
        end=lambda l: l.startswith('2025年12月30日'),
        header='国家药监局关于加强药品受托生产监督管理工作的公告（2025年第134号）',
        keywords=['组织机构', '关键人员', '质量受权人', '质量协议', '质量管理体系', '主体责任', '工作组', '负责人'],
    ),
    dict(
        docId='cn-med-inst-pharm-admin-2011',
        title='医疗机构药事管理规定',
        issuer='卫生部、国家中医药管理局、总后勤部卫生部',
        edition='2011年印发（现行有效）',
        pub='2011-03-30', eff='2011-03-01',
        num='卫医政发〔2011〕11号',
        url='https://www.nhc.gov.cn/wjw/c100175/201103/0819a008695340a1a61173a09ef674df.shtml',
        raw='med-inst-pharm-admin-2011_nhc.txt', kind='txt',
        start=lambda l: l.startswith('医疗机构药事管理规定'),
        end=lambda l: '本规定自2011年3月1日起施行' in l,
        header='医疗机构药事管理规定（卫医政发〔2011〕11号）',
        keywords=['药事管理与药物治疗学', '药学部门', '组织机构', '临床药师', '第一责任人', '职责'],
    ),
    dict(
        docId='cn-prescription-review-2018',
        title='医疗机构处方审核规范',
        issuer='国家卫生健康委员会办公厅、国家中医药管理局办公室、中央军委后勤保障部办公厅',
        edition='2018年印发（现行有效）',
        pub='2018-06-29', eff='2018-06-29',
        num='国卫办医发〔2018〕14号',
        url='https://www.gov.cn/zhengce/zhengceku/2018-12/31/content_5435182.htm',
        raw='prescription-review-2018_govcn.txt', kind='txt',
        start=lambda l: l.startswith('医疗机构处方审核规范'),
        end=lambda l: '本规范自印发之日起施行' in l,
        header='医疗机构处方审核规范（国卫办医发〔2018〕14号）',
        keywords=['药事管理与药物治疗学', '第一责任人', '处方审核', '药师', '信息系统'],
    ),
    dict(
        docId='cn-antineoplastic-clinical-2020-487',
        title='抗肿瘤药物临床应用管理办法（试行）',
        issuer='国家卫生健康委员会',
        edition='2020年印发（试行，现行有效）',
        pub='2020-12-22', eff='2021-03-01',
        num='国卫医函〔2020〕487号',
        url='https://www.nhc.gov.cn/yzygj/c100068/202012/02cc3fdaca5c46519b24d677b56bb499.shtml',
        raw='antineoplastic-2020_nhc.txt', kind='txt',
        start=lambda l: l.startswith('抗肿瘤药物临床应用管理办法'),
        end=lambda l: '本办法自2021年3月1日起施行' in l,
        header='抗肿瘤药物临床应用管理办法（试行）（国卫医函〔2020〕487号）',
        keywords=['组织机构', '第一责任人', '管理工作组', '药事管理与药物治疗学', '处方权', '处方审核', '职责'],
    ),
    dict(
        docId='cn-vbp-normalization-2021-2',
        title='国务院办公厅关于推动药品集中带量采购工作常态化制度化开展的意见',
        issuer='国务院办公厅',
        edition='2021年印发（现行有效）',
        pub='2021-01-22', eff='2021-01-22',
        num='国办发〔2021〕2号',
        url='https://www.gov.cn/zhengce/content/2021-01/28/content_5583305.htm',
        raw='vbp-2021-2_govcn.html', kind='html',
        start=lambda l: l.strip() == '国办发〔2021〕2号',
        end=lambda l: l.startswith('2021年1月22日'),
        header='国务院办公厅关于推动药品集中带量采购工作常态化制度化开展的意见（国办发〔2021〕2号）',
        keywords=['医疗机构', '医保', '药监', '卫生健康', '联盟', '协同', '组织', '主体责任'],
    ),
]

report = {}
for d in DOCS:
    lines = html_lines(os.path.join(RAW, d['raw'])) if d['kind'] == 'html' else txt_lines(os.path.join(RAW, d['raw']))
    body = format_body(lines, d['start'], d['end'])
    body, hits = annotate(body, d['keywords'])
    loc = '\n'.join(f'- {n}（命中关键词：{k}）' for n, k in hits) or '- （无命中）'
    md = FM.format(docId=d['docId'], title=d['title'], issuer=d['issuer'], edition=d['edition'],
                   pub=d['pub'], eff=d['eff'], num=d['num'], url=d['url'], today=TODAY)
    md += f'\n# {d["header"]}\n'
    md += '\n> 机器抽取稿，未经人工复核（machine-extract, unreviewed）。条款层级保留：章/节为标题，"第N条"为独立加粗段。【组织设计相关】为机器按关键词初标。\n'
    md += '\n## 组织设计相关条款定位（机器初标）\n\n' + loc + '\n'
    md += '\n---\n' + body + '\n'
    out = os.path.join(BASE, d['docId'] + '.md')
    open(out, 'w', encoding='utf-8').write(md)
    report[d['docId']] = dict(bytes=len(md.encode()), hits=len(hits), articles=len(re.findall(r'^\*\*第', body, re.M)))
for k, v in report.items():
    print(k, v)
