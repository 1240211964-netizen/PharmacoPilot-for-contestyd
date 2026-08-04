#!/usr/bin/env python3
"""Convert OpenStax Principles of Management web pages (raw HTML) to clean Markdown.

Keeps: heading hierarchy, paragraphs, key-term bolding, tables (GFM),
Learning Objectives, Key Terms, Summary of Learning Outcomes,
Chapter Review Questions, feature boxes (as blockquotes), figure captions.
Strips: nav/header/footer/share buttons/images (captions kept)/scripts/styles.
"""
import re
import sys
from bs4 import BeautifulSoup, NavigableString, Tag

WS = re.compile(r'\s+')


def norm(t: str) -> str:
    return WS.sub(' ', t)


def inline(node) -> str:
    """Render an inline node (or element's inline content) to Markdown text."""
    out = []

    def walk(n):
        if isinstance(n, NavigableString):
            out.append(norm(str(n)))
            return
        if not isinstance(n, Tag):
            return
        name = n.name
        cls = n.get('class') or []
        if name in ('script', 'style', 'button', 'img', 'svg', 'noscript'):
            return
        if n.get('data-media') == 'screenreader':
            return
        if name == 'span' and n.get('data-type') == 'media':
            # inline icon/image: keep short alt text in brackets
            alt = n.get('data-alt') or ''
            if alt and len(alt) <= 40:
                out.append(f' [{alt}] ')
            return
        if name == 'a':
            href = n.get('href') or ''
            sup = n.find('sup')
            if sup is not None and not href.startswith('http'):
                out.append(f' [{sup.get_text(strip=True)}] ')
                return
            text = ''.join(collect(n))
            text = norm(text).strip()
            if href.startswith('http'):
                out.append(f' [{text}]({href}) ')
            else:
                out.append(f' {text} ' if text else ' ')
            return
        if name == 'sup':
            out.append(f' [{n.get_text(strip=True)}] ')
            return
        if name in ('strong', 'b'):
            text = ''.join(collect(n)).strip()
            if text:
                out.append(f' **{text}** ')
            return
        if name in ('em', 'i'):
            text = ''.join(collect(n)).strip()
            if text:
                out.append(f' *{text}* ')
            return
        if name == 'span' and n.get('data-type') == 'term':
            text = ''.join(collect(n)).strip()
            if text:
                out.append(f' **{text}** ')
            return
        if name == 'span' and 'os-divider' in cls:
            out.append(' ')
            return
        if name == 'span' and ('os-number' in cls or 'os-title-label' in cls):
            out.append(n.get_text(strip=True) + ' ')
            return
        if name == 'br':
            out.append(' ')
            return
        for c in n.children:
            walk(c)

    def collect(n):
        parts = []
        for c in n.children:
            if isinstance(c, NavigableString):
                parts.append(norm(str(c)))
            elif isinstance(c, Tag):
                if c.name in ('script', 'style', 'button', 'img', 'svg'):
                    continue
                if c.get('data-type') == 'term':
                    parts.append(' ' + c.get_text(' ', strip=True) + ' ')
                else:
                    parts.append(''.join(collect(c)))
        return parts

    walk(node)
    txt = ''.join(out)
    txt = WS.sub(' ', txt)
    # tidy spacing around punctuation/bold
    txt = re.sub(r'\s+([,.;:!?%)])', r'\1', txt)
    txt = re.sub(r'([(])\s+', r'\1', txt)
    return txt.strip()


def table_md(div: Tag) -> str:
    tbl = div.find('table')
    rows = []
    title = None
    thead = tbl.find('thead')
    header = []
    if thead:
        trs = thead.find_all('tr')
        for tr in trs:
            cells = tr.find_all(['th', 'td'])
            if len(cells) == 1 and cells[0].get('colspan'):
                title = inline(cells[0])
            else:
                header = [inline(c) for c in cells]
    tbody = tbl.find('tbody')
    body_trs = tbody.find_all('tr') if tbody else tbl.find_all('tr')
    for tr in body_trs:
        cells = tr.find_all(['td', 'th'])
        if cells:
            rows.append([inline(c) for c in cells])
    ncols = max([len(header)] + [len(r) for r in rows]) if (header or rows) else 0
    if not header and rows:
        header, rows = rows[0], rows[1:]
    header += [''] * (ncols - len(header))
    lines = []
    cap = div.find('div', class_='os-caption-container')
    cap_text = norm(cap.get_text(' ', strip=True)).strip() if cap else ''
    if title:
        lines.append(f'**{title}**')
        lines.append('')
    if cap_text:
        lines.append(f'*{cap_text}*')
        lines.append('')
    esc = lambda s: s.replace('|', '\\|')
    lines.append('| ' + ' | '.join(esc(h) for h in header) + ' |')
    lines.append('| ' + ' | '.join('---' for _ in header) + ' |')
    for r in rows:
        r += [''] * (ncols - len(r))
        lines.append('| ' + ' | '.join(esc(c) for c in r) + ' |')
    return '\n'.join(lines)


def figure_md(div: Tag) -> str:
    cap = div.find('figcaption') or div.find('div', class_='os-caption-container')
    if not cap:
        return ''
    parts = []
    for sel in ['os-title-label', 'os-number']:
        el = cap.find(class_=sel)
        if el:
            parts.append(el.get_text(strip=True))
    t = cap.find(class_='os-title')
    if t:
        parts.append(t.get_text(' ', strip=True))
    head = ' '.join(parts)
    body = cap.find(class_='os-caption')
    body_t = inline(body) if body else ''
    full = head + ('. ' if head and body_t else '') + body_t
    return f'*{norm(full).strip()}*'


def list_md(lst: Tag, depth: int = 0) -> str:
    ordered = lst.name == 'ol'
    lines = []
    for i, li in enumerate(lst.find_all('li', recursive=False), 1):
        marker = f'{i}.' if ordered else '-'
        # split li content: direct inline/text vs nested lists/blocks
        chunks = []
        nested = []
        for c in li.children:
            if isinstance(c, Tag) and c.name in ('ul', 'ol'):
                nested.append(c)
            else:
                chunks.append(c)
        text = ''.join(inline(c) if isinstance(c, Tag) else norm(str(c)) for c in chunks)
        text = norm(text).strip()
        pad = '  ' * depth
        lines.append(f'{pad}{marker} {text}')
        for nl in nested:
            lines.append(list_md(nl, depth + 1))
    return '\n'.join(lines)


def is_box(el: Tag) -> bool:
    return el.name == 'div' and el.get('data-type') == 'note'


def box_md(el: Tag) -> str:
    title_el = el.find(class_='os-title')
    title = inline(title_el) if title_el else 'Box'
    body = el.find('div', class_='os-note-body')
    inner = blocks_md(body) if body else ''
    lines = [f'> **{title}**']
    for ln in inner.split('\n'):
        lines.append('> ' + ln if ln.strip() else '>')
    return '\n'.join(lines)


def blocks_md(root: Tag) -> str:
    """Render block-level children of root to Markdown."""
    out = []

    def emit(t):
        t = t.strip('\n')
        if t.strip():
            out.append(t)

    for el in root.children:
        if isinstance(el, NavigableString):
            if el.strip():
                emit(norm(str(el)))
            continue
        if not isinstance(el, Tag):
            continue
        name = el.name
        if name in ('script', 'style', 'noscript'):
            continue
        # unwrap links that wrap block-level headings (e.g. summary page)
        if name == 'a' and el.find(['h2', 'h3', 'h4', 'h5']):
            inner = blocks_md(el)
            if inner.strip():
                emit(inner)
            continue
        cls = el.get('class') or []
        if name == 'h2':
            emit(f'\n## {inline(el)}')
        elif name == 'h3':
            if 'os-title' in cls:
                continue  # handled by box
            emit(f'\n### {inline(el)}')
        elif name == 'h4':
            if 'os-title' in cls:
                continue
            emit(f'\n#### {inline(el)}')
        elif name == 'h5':
            emit(f'\n##### {inline(el)}')
        elif name == 'p':
            t = inline(el)
            if t:
                emit(t)
        elif name in ('ul', 'ol'):
            emit(list_md(el))
        elif name == 'div' and 'os-figure' in cls:
            emit(figure_md(el))
        elif name == 'div' and 'os-table' in cls:
            emit(table_md(el))
        elif name == 'figure':
            emit(figure_md(el))
        elif name == 'table':
            emit(table_md(el.parent if el.parent and 'os-table' in (el.parent.get('class') or []) else el))
        elif is_box(el):
            emit(box_md(el))
        elif name in ('div', 'section', 'aside', 'article', 'span'):
            inner = blocks_md(el)
            if inner.strip():
                emit(inner)
        elif name == 'blockquote':
            inner = blocks_md(el)
            emit('\n'.join('> ' + l if l.strip() else '>' for l in inner.split('\n')))
        elif name == 'dl':
            items = el.find_all(['dt', 'dd'], recursive=False)
            i = 0
            while i < len(items):
                if items[i].name == 'dt':
                    term = inline(items[i])
                    dfn = ''
                    if i + 1 < len(items) and items[i + 1].name == 'dd':
                        dfn = inline(items[i + 1])
                        i += 1
                    emit(f'- **{term}**' + (f' {dfn}' if dfn else ''))
                else:
                    t = inline(items[i])
                    if t:
                        emit(t)
                i += 1
        else:
            t = inline(el)
            if t:
                emit(t)
    return '\n\n'.join(out)


def convert(path: str) -> tuple[str, str]:
    soup = BeautifulSoup(open(path, encoding='utf-8'), 'html.parser')
    page = soup.find('div', {'data-type': 'page'}) or soup.find('div', {'data-type': 'composite-page'})
    if page is None:
        raise RuntimeError(f'no page container in {path}')
    h2 = page.find('h2', {'data-type': 'document-title'}) or page.find('h2')
    title = norm(h2.get_text(' ', strip=True)) if h2 else ''
    if h2 is not None:
        h2.decompose()  # assembler adds the heading back at the right level
    # Label the leading Learning Objectives list (rendered on the site without
    # a heading element; the printed/web UI labels it "Learning Objectives").
    lo_label = False
    for el in page.children:
        if isinstance(el, Tag):
            if el.name == 'ol':
                lo_label = True
            break
    body = blocks_md(page)
    if lo_label:
        body = re.sub(r'\A\s*(1\. )', r'**Learning Objectives**\n\n\1', body, count=1)
    return title, body.strip()


if __name__ == '__main__':
    title, body = convert(sys.argv[1])
    print(f'## {title}')
    print()
    print(body)
