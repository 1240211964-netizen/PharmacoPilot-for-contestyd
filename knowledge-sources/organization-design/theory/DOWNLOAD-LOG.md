# Theory-layer download log — 组织设计 (organization design)

Run date: 2026-08-04 (UTC). Sequential requests, ≥2 s intervals, official domains only
(openstax.org, ocw.mit.edu). No mirrors/aggregators. No captcha/login bypass.

## 1. OpenStax — Principles of Management §3.7

| Attempt | URL | Result |
|---|---|---|
| TOC/slug lookup (via web search snippet, then direct fetch) | https://openstax.org/books/principles-management/pages/3-7-contingency-and-system-management | OK — HTTP 200, 303 824 bytes, saved to `raw/openstax-pom-3-7-contingency-and-system-management.html` |

- Slug confirmed: §3.7 = "Contingency and System Management" (Chapter 3, The History of Management).
- Page is a server-rendered OpenStax Rex page; `div[data-type=page]` holds full section text
  (5 704 chars extracted; converted with existing `organization-design/raw/convert.py` + bs4).
- Coverage check against other sections: §4.3 (already in库) covers matrix / team-based / virtual /
  mechanistic / organic; ch10 (already in库) covers matrix + organizational change. No other
  OpenStax section needed — only the contingency gap was open, now filled by §3.7.

## 2. MIT OpenCourseWare — 15.320 Strategic Organizational Design (Spring 2011, Malone)

| Attempt | URL | Result |
|---|---|---|
| Lecture-notes index page | https://ocw.mit.edu/courses/15-320-strategic-organizational-design-spring-2011/pages/lecture-notes/ | OK — 50 802 bytes, `raw/ocw-15-320-lecture-notes.html`; lists 10 resource-page PDF links |
| Resource page lec01 | …/resources/mit15_320s11_lec01/ → …/875f1f29…lec01.pdf | PDF downloaded (2 197 650 bytes) but **blocked at extraction**: image-only slides, pypdf yields only per-page copyright lines (2 010 chars / 19 pp). No OCR per discipline. Registry entry `ocw-15-320-s11-lec01` = blocked. |
| Resource page lec03 | …/resources/mit15_320s11_lec03/ → …/58b0fe11…lec03.pdf | OK — 498 100 bytes, 17 pp, text layer good (4 323 chars) |
| Resource page lec05 | …/resources/mit15_320s11_lec05/ → …/bd53cbbd…lec05.pdf | OK — 473 824 bytes, 17 pp, text layer good (7 437 chars); core design module |
| Resource page lec10 | …/resources/mit15_320s11_lec10/ → …/539ade62…lec10.pdf | Downloaded (5 pp) but text layer very thin (1 857 chars, mostly slide fragments); not retained, raw file removed |
| Resource page lec12 | …/resources/mit15_320s11_lec12/ → …/2a5ddf34…lec12.pdf | OK — 507 745 bytes, 3 pp (Kotter eight steps summary) |
| Syllabus page | https://ocw.mit.edu/courses/15-320-strategic-organizational-design-spring-2011/pages/syllabus/ | OK — 50 253 bytes, `raw/ocw-15-320-syllabus.html`; converted to Markdown (bs4, `main#course-content-section`) |

- License verification: both OCW pages carry `"license": "https://creativecommons.org/licenses/by-nc-sa/4.0/"`
  in page JSON-LD metadata → CC BY-NC-SA 4.0 confirmed site-wide per OCW terms.
- Other OCW courses considered but not fetched: 15.311 Organizational Processes (Fall 2003,
  syllabus mentions contingency theory — overlapping, older), 15.668 People and Organizations
  (Fall 2010, lec05 "Strategic Design Perspective" PDF surfaced in search but course as a whole
  is OB-focused). One course (15.320) selected as directly on-topic; task allowed 1–2.

## Extraction summary

| docId | raw | extracted | status |
|---|---|---|---|
| openstax-pom-ch03-3-7 | html 303 824 B | md 6 625 B | acquired_reference_only |
| ocw-15-320-s11-syllabus | html 50 253 B | md 3 691 B | acquired_reference_only |
| ocw-15-320-s11-lec03 | pdf 498 100 B | md 5 158 B | acquired_reference_only |
| ocw-15-320-s11-lec05 | pdf 473 824 B | md 8 460 B | acquired_reference_only |
| ocw-15-320-s11-lec12 | pdf 507 745 B | md 2 046 B | acquired_reference_only |
| ocw-15-320-s11-lec01 | pdf 2 197 650 B | — | blocked (image-only slides) |

All sha256 values in `../../registry/theory.json`. All entries reference-only:
llmInputAllowed=false, embeddingAllowed=false, publicRedistributionAllowed=false.
