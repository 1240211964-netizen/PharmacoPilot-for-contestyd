# FETCH-NOTES — OpenStax *Principles of Management* (organization-design sources)

- Fetch date (UTC): 2026-08-03
- Fetcher: machine (curl + Python/BeautifulSoup conversion), unreviewed
- Source domain: openstax.org only (no third-party mirrors)

## 1. Search / location process

1. WebSearch for the official OpenStax *Principles of Management* table of contents
   and candidate sections → found section pages `10-1-organizational-structures-and-design`
   and `4-3-organizational-designs-and-structures` on openstax.org.
2. The JS-driven details page (`https://openstax.org/details/books/principles-of-management`)
   is not statically readable, so the authoritative TOC was extracted from the
   `window.__PRELOADED_STATE__` JSON embedded in the official chapter pages themselves
   (same data the site renders its TOC from).
3. All chapter/section pages were fetched with curl from
   `https://openstax.org/books/principles-management/pages/<slug>` (HTTP 200 for every
   page listed below). Raw HTML is archived in `./raw/` together with the conversion
   scripts (`convert.py`, `assemble.py`) for provenance and re-runs.

## 2. Official book structure (from the embedded TOC)

*Principles of Management* (OpenStax, Rice University). 18 chapters + Preface + References + Index:

1. Managing and Performing
2. Managerial Decision-Making
3. The History of Management (incl. 3.7 Contingency and System Management — historical view)
4. External and Internal Organizational Environments and Corporate Culture (incl. **4.3 Organizational Designs and Structures**)
5. Ethics, Corporate Responsibility, and Sustainability
6. International Management
7. Entrepreneurship
8. Strategic Analysis: Understanding a Firm's Competitive Environment
9. The Strategic Management Process: Achieving and Sustaining Competitive Advantage
10. **Organizational Structure and Change** (10.1 Organizational Structures and Design; 10.2 Organizational Change; 10.3 Managing Change + Key Terms, Summary of Learning Outcomes, Chapter Review Questions, exercises, Critical Thinking Case)
11. Human Resource Management
12. Diversity in Organizations
13. Leadership
14. Work Motivation for Performance
15. Managing Teams
16. Managerial Communication
17. Organizational Planning and Controlling
18. Management of Technology and Innovation

## 3. Chapter selection rationale

- **Chapter 10 "Organizational Structure and Change"** is the official chapter covering
  organizational structure and organizational design: 10.1 defines organizational
  structure/design, formal vs informal organization, Weber's bureaucratic elements
  (specialization, command-and-control, **span of control**, **centralization**,
  formalization), **mechanistic vs organic structures** (Table 10.1, incl.
  **departmentalization**), and business structures (product/geographic/matrix).
  The full chapter (all 10 official pages) was converted into one file.
- **Section 4.3 "Organizational Designs and Structures"** (Chapter 4) was added because
  Chapter 10 does not mention "chain of command" explicitly, while 4.3 uses it
  (3 occurrences) and additionally covers structure types (functional, divisional,
  geographic, matrix, networked team, virtual) and **span of control** in a
  mechanistic/organic framing. Only section 4.3 was taken — the rest of Chapter 4
  (external environments, corporate culture) is outside the organization-design scope.
- Topic coverage result (grep counts in the delivered files):

| Topic | ch10 file | ch04-4.3 file |
| --- | --- | --- |
| organizational structure | ✓ (39) | ✓ (16) |
| organizational design | ✓ (6) | ✓ (11) |
| span of control | ✓ (11) | ✓ (2) |
| centralization / decentralization | ✓ (14 / 2) | ✓ (3 / 2) |
| departmentalization | ✓ (1, Table 10.1) | ✓ (1) |
| mechanistic vs organic structures | ✓ (28 / 22) | ✓ (12 / 15) |
| chain of command | ✗ (0) | ✓ (3) |
| contingency (factors) | ✗ (0) | ✗ (0) |

- **"Contingency factors" gap (honest report):** neither fetched chapter uses the term
  "contingency". The idea appears only implicitly (structure "depends on the
  circumstances"; organic structures suit dynamic environments). The book's explicit
  contingency treatment is 3.7 "Contingency and System Management" (history-of-management
  perspective), which was NOT fetched because it belongs to Chapter 3 (history), not
  organization design. Flag for KB curators: if contingency-factor coverage is required,
  consider adding section 3.7 or another source.

## 4. License confirmation — ⚠ differs from initial assumption

**Assumption going in:** CC BY 4.0.
**Fact on the official site (verified 2026-08-03):** the current web version of
*Principles of Management* is licensed **CC BY-NC-SA 4.0**
(Attribution-NonCommercial-ShareAlike), NOT CC BY 4.0.

Evidence (all from openstax.org pages, archived in `./raw/`):

- Embedded book metadata (`__PRELOADED_STATE__` on every chapter page):
  `"license":{"url":"http://creativecommons.org/licenses/by-nc-sa/4.0/","name":"Creative Commons Attribution-NonCommercial-ShareAlike License"}`
- Preface (https://openstax.org/books/principles-management/pages/preface), verbatim:
  > "Principles of Management is licensed under a Creative Commons
  > Attribution-NonCommercial-ShareAlike 4.0 (CC BY NC-SA) license, which means that you
  > can non-commercially distribute, remix, and build upon the content, as long as you
  > provide attribution to OpenStax and its content contributors, and distribute all
  > derivatives under the same license."
- Page footer on every chapter page, verbatim:
  > "© Apr 23, 2026 OpenStax. Textbook content produced by OpenStax is licensed under a
  > Creative Commons Attribution-NonCommercial-ShareAlike License."
- Note: figure-level attribution strings baked into the 2019 content still read
  "under CC-BY 4.0 license" (e.g. Table 10.1 caption). These are legacy in-content
  captions; the book-level license statement currently published by OpenStax is
  CC BY-NC-SA 4.0, which is what the front-matter records.
- License URL: http://creativecommons.org/licenses/by-nc-sa/4.0/
- **Additional restriction stated on the Citation/Attribution panel of every page, verbatim:**
  > "This book may not be used in the training of large language models or otherwise be
  > ingested into large language models or generative AI offerings without OpenStax's
  > permission."
  → Flag for the KB owner before LLM ingestion/RAG use.

**Official attribution text (required on every page view / printed page), verbatim:**
> "Access for free at https://openstax.org/books/principles-management/pages/1-introduction"

**Official citation information (from the on-page Citation/Attribution panel):**
Authors: David S. Bright, Anastasia H. Cortes; Publisher/website: OpenStax;
Book title: Principles of Management; Publication date: Mar 20, 2019;
Location: Houston, Texas.

## 5. Delivered files

| File | Bytes | SHA-256 | Source URL(s) |
| --- | --- | --- | --- |
| `openstax-pom-ch10-organizational-structure-and-change.md` | 95911 | 9d3c49d6880d41b16ab1ea15a69cabc28e8527444141f947f5bf07a5af6b41b5 | https://openstax.org/books/principles-management/pages/10-introduction (+ 9 sibling pages listed in §2) |
| `openstax-pom-ch04-4-3-organizational-designs-and-structures.md` | 23578 | 029a8b421f696bad53796cb61c7aed71b5185d8d3e99baae07e31d363dd11a6d | https://openstax.org/books/principles-management/pages/4-3-organizational-designs-and-structures |

Chapter 10 file aggregates these official pages (all fetched HTTP 200):
10-introduction; 10-1-organizational-structures-and-design; 10-2-organizational-change;
10-3-managing-change; 10-key-terms; 10-summary-of-learning-outcomes;
10-chapter-review-questions; 10-management-skills-application-exercises;
10-managerial-decision-exercises; 10-critical-thinking-case.

## 6. Conversion notes / known gaps

- Conversion: `raw/convert.py` (BeautifulSoup → Markdown), assembly: `raw/assemble.py`.
  Headings: `#` chapter, `##` page/section (10.1, Key Terms, …), `###`/`####` subsections;
  key terms (`span[data-type="term"]`) bolded; tables → GFM; feature boxes
  (Concept Check, Exploring Managerial Careers, …) → blockquotes; figure images dropped,
  captions kept as italic lines (e.g. `*Exhibit 10.2 Formal Organizational Chart. …*`).
- "Learning Objectives" label: the web pages render the section objectives list without
  a heading element (the label is chrome around it); a `**Learning Objectives**` label
  was inserted before each leading objectives list. This is the only editorial addition.
- Footnote markers (e.g. `[1]`, `[23]`) are kept inline, but their reference entries
  live on the book-wide References page
  (https://openstax.org/books/principles-management/pages/references), which was NOT
  fetched (it covers all 18 chapters; out of scope). Note as missing-by-design.
- Completeness self-check: per-page comparison of source block counts vs converted output
  (paragraphs, tables, figures, note boxes) showed no truncation; all tables (Table 10.1),
  all figure captions (ch10: 8 exhibits incl. intro splash; 4.3: 10 exhibits), all note
  boxes, Key Terms (all glossary entries), Summary of Learning Outcomes (10.1–10.3),
  Chapter Review Questions (9 questions) are present.
- Minor artifacts accepted knowingly: inline superscript footnote numbers rendered as
  `[N]`; one inline continuum arrow icon in the Table 10.1 header rendered as its alt
  text `[A double-headed arrow.]`; legacy "CC-BY 4.0" strings inside 2019-era figure
  captions are preserved verbatim (see §4).
- `reviewed: false` / `correctedBy: machine-fetch,unreviewed` in front-matter — human
  review still pending.
