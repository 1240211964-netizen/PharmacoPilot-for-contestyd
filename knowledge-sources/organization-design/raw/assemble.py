#!/usr/bin/env python3
"""Assemble final knowledge-source Markdown files with YAML front-matter."""
import sys
import convert as C

TS = '2026-08-03T16:34:53Z'
BASE = 'https://openstax.org/books/principles-management/pages'
VERSION = ('Web view (openstax.org archive 20260604.144757, content ec78dd8); '
           'first published Mar 20, 2019')
LICENSE = 'CC BY-NC-SA 4.0'
LICENSE_URL = 'http://creativecommons.org/licenses/by-nc-sa/4.0/'
ATTRIBUTION = 'Access for free at https://openstax.org/books/principles-management/pages/1-introduction'


def front_matter(doc_id, title, source_url):
    return f"""---
docId: {doc_id}
title: "{title}"
sourceType: textbook
author_or_issuer: "OpenStax, Rice University"
edition_or_version: "{VERSION}"
publication_date: "2019-03-20"
source_url: {source_url}
license: "{LICENSE}"
license_url: {LICENSE_URL}
attribution: "{ATTRIBUTION}"
language: en
retrieved_at: {TS}
correctedBy: "machine-fetch,unreviewed"
correctedAt: {TS}
reviewed: false
pageMap: []
---
"""


def page_block(slug, level='##'):
    title, body = C.convert(f'{slug}.html')
    return f'{level} {title}\n\n{body}' if body else f'{level} {title}'


CH10_PAGES = [
    '10-introduction',
    '10-1-organizational-structures-and-design',
    '10-2-organizational-change',
    '10-3-managing-change',
    '10-key-terms',
    '10-summary-of-learning-outcomes',
    '10-chapter-review-questions',
    '10-management-skills-application-exercises',
    '10-managerial-decision-exercises',
    '10-critical-thinking-case',
]


def build_ch10():
    fm = front_matter(
        'doc_openstax_pom_ch10',
        'Principles of Management (OpenStax) — Chapter 10: Organizational Structure and Change',
        f'{BASE}/10-introduction',
    )
    parts = [fm, '# Chapter 10: Organizational Structure and Change\n']
    for slug in CH10_PAGES:
        parts.append(page_block(slug))
    return '\n\n'.join(parts) + '\n'


def build_ch04_s43():
    fm = front_matter(
        'doc_openstax_pom_ch04',
        'Principles of Management (OpenStax) — Chapter 4, Section 4.3: Organizational Designs and Structures',
        f'{BASE}/4-3-organizational-designs-and-structures',
    )
    parts = [fm, '# Chapter 4 (Section 4.3): Organizational Designs and Structures\n']
    parts.append(page_block('4-3-organizational-designs-and-structures'))
    return '\n\n'.join(parts) + '\n'


if __name__ == '__main__':
    out_dir = '..'
    with open(f'{out_dir}/openstax-pom-ch10-organizational-structure-and-change.md', 'w', encoding='utf-8') as f:
        f.write(build_ch10())
    with open(f'{out_dir}/openstax-pom-ch04-4-3-organizational-designs-and-structures.md', 'w', encoding='utf-8') as f:
        f.write(build_ch04_s43())
    print('written')
