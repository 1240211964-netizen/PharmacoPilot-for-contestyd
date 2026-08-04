#!/usr/bin/env python3
"""Extract text from company disclosure documents (PDF via pypdf, HTM via bs4).

Usage: extract.py <input> <output.md> <frontmatter.yml>
Prints a JSON quality report to stdout.
Front-matter file is prepended verbatim; body pages are separated by <!-- page N -->.
For HTML inputs there are no pages: the whole text is one logical block and
quality metrics are computed over 4000-char chunks (reported as 'chunks').
"""
import json
import re
import statistics
import sys

GARBLE = re.compile(r"[�□]|[\x00-\x08\x0b\x0c\x0e-\x1f]")


def quality(lengths, texts):
    med = statistics.median(lengths) if lengths else 0
    garb = sum(len(GARBLE.findall(t)) for t in texts)
    total = sum(lengths) or 1
    return {
        "units": len(lengths),
        "chars_total": sum(lengths),
        "chars_per_unit_median": med,
        "garbled_char_rate": round(garb / total, 6),
        "empty_units": sum(1 for l in lengths if l < 20),
    }


def extract_pdf(src):
    from pypdf import PdfReader

    r = PdfReader(src)
    pages, lengths = [], []
    for i, p in enumerate(r.pages, 1):
        try:
            t = p.extract_text() or ""
        except Exception as e:  # noqa: BLE001
            t = f"[extract_text error: {e}]"
        pages.append(f"<!-- page {i} -->\n\n{t}")
        lengths.append(len(t.strip()))
    return "\n\n".join(pages), quality(lengths, pages)


def extract_html(src):
    from bs4 import BeautifulSoup

    with open(src, encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f.read(), "lxml")
    for tag in soup(["script", "style"]):
        tag.decompose()
    # drop inline-XBRL hidden header (machine-readable tags, not document text)
    for tag in soup.find_all(re.compile(r"^ix:(header|hidden|references|resources)$")):
        tag.decompose()
    for tag in soup.find_all(attrs={"style": re.compile(r"display\s*:\s*none", re.I)}):
        tag.decompose()
    text = soup.get_text("\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    chunks = [text[i : i + 4000] for i in range(0, len(text), 4000)]
    return text.strip(), quality([len(c) for c in chunks], chunks)


def main():
    src, out, fm = sys.argv[1], sys.argv[2], sys.argv[3]
    if src.lower().endswith(".pdf"):
        body, q = extract_pdf(src)
        q["kind"] = "pages"
    else:
        body, q = extract_html(src)
        q["kind"] = "chunks"
    with open(fm, encoding="utf-8") as f:
        front = f.read()
    with open(out, "w", encoding="utf-8") as f:
        f.write(front.rstrip() + "\n\n" + body + "\n")
    print(json.dumps({"src": src, "out": out, **q}, ensure_ascii=False))


if __name__ == "__main__":
    main()
