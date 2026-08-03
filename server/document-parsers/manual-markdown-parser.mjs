/**
 * manual-markdown adapter —— 兜底与基线解析器，完整可用，不依赖外部环境。
 *
 * 输入：人工校正的 Markdown 文件，带 YAML front-matter：
 *   ---
 *   docId: sample-001            # 必填
 *   title: …                     # 必填
 *   sourceType: 中文政策          # 必填
 *   correctedBy: 教学团队         # 必填（校正人）
 *   correctedAt: 2026-08-02T09:00:00+08:00   # 必填（ISO-8601）
 *   reviewed: true               # 必填（true/false → reviewStatus）
 *   parseConfidence: 0.95        # 可选，校正人自评；缺省 reviewed=0.9 / unreviewed=0.7
 *   pageMap:                     # 可选；缺省时全部 block pageIndex=null 并记录 warning
 *     - heading: 第一章 总则      # 锚点：与某 heading 块的文本精确匹配
 *       pageIndex: 0
 *       pageLabel: "1"
 *     - block: 5                 # 或锚点：全文第 5 个 block（1 起计）
 *       pageIndex: 1
 *       pageLabel: "2"
 *   ---
 *
 * 结构规则：
 *   #/##/…            → heading
 *   段首“第N条”        → policy_article
 *   段首“（一）”或“1.”  → policy_clause（parentBlockId = 最近的 policy_article）
 *   GFM 表格           → table（同时入 tables[]）
 *   段首“图N”          → figure_caption
 *   其余               → paragraph
 * 段内以结构性标记起始的行自成一块；普通续行并入前一 article/clause/paragraph 块。
 */

import { readFile } from "node:fs/promises";
import { ParserError, sha256Hex, validateParsedDocument } from "./parser-contract.mjs";

export const MANUAL_MARKDOWN_VERSION = "1.0.0";

const REQUIRED_FRONTMATTER_KEYS = ["docId", "title", "sourceType", "correctedBy", "correctedAt", "reviewed"];

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const POLICY_ARTICLE_RE = /^第[0-9一二三四五六七八九十百千]+条/;
const POLICY_CLAUSE_RE = /^(?:（[一二三四五六七八九十]+）|\([一二三四五六七八九十]+\)|\d+[.、]\s*)/;
const FIGURE_CAPTION_RE = /^图\s*\d+/;
const TABLE_LINE_RE = /^\|.*\|$/;
const TABLE_SEPARATOR_RE = /^\|[\s:|-]+\|$/;

/** 判断一行是否以结构性标记起始（在段内也自成一块）。 */
function startsStructuralBlock(line) {
  return (
    HEADING_RE.test(line) ||
    POLICY_ARTICLE_RE.test(line) ||
    POLICY_CLAUSE_RE.test(line) ||
    FIGURE_CAPTION_RE.test(line) ||
    TABLE_LINE_RE.test(line)
  );
}

/** 归一化文本：NFKC（全半角等）+ 折叠空白。机械门禁逐字引用校验基于它。 */
export function normalizeText(text) {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * 解析 front-matter 的最小 YAML 子集：
 * 顶层 `key: value`，以及 `key:` 后跟 `- k: v` 缩进列表（仅 pageMap 使用）。
 * 不支持嵌套对象/多行字符串 —— 超出子集即报错，不静默猜。
 */
export function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new ParserError(
      "FRONTMATTER_MISSING",
      "manual-markdown 输入必须以 YAML front-matter（--- 围栏）开头",
    );
  }
  const endIndex = normalized.indexOf("\n---", 4);
  if (endIndex === -1) {
    throw new ParserError("FRONTMATTER_MISSING", "front-matter 缺少结束围栏 ---");
  }
  const rawBlock = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + "\n---".length).replace(/^\r?\n/, "");

  const data = {};
  const lines = rawBlock.split("\n");
  let listKey = null;
  let listItem = null;
  for (const rawLine of lines) {
    if (rawLine.trim() === "" || rawLine.trimStart().startsWith("#")) continue;
    const listMatch = rawLine.match(/^\s+-\s+(.*)$/);
    const nestedMatch = rawLine.match(/^\s+([A-Za-z][\w-]*):\s*(.*)$/);
    const topMatch = rawLine.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (listMatch && listKey) {
      listItem = {};
      data[listKey].push(listItem);
      const pair = listMatch[1].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (!pair) {
        throw new ParserError("FRONTMATTER_INVALID", `pageMap 列表项必须是 key: value 形式：${listMatch[1]}`);
      }
      listItem[pair[1]] = parseScalar(pair[2]);
    } else if (nestedMatch && listKey && listItem) {
      listItem[nestedMatch[1]] = parseScalar(nestedMatch[2]);
    } else if (topMatch) {
      const [, key, value] = topMatch;
      if (value.trim() === "") {
        data[key] = [];
        listKey = key;
        listItem = null;
      } else {
        data[key] = parseScalar(value);
        listKey = null;
        listItem = null;
      }
    } else {
      throw new ParserError("FRONTMATTER_INVALID", `无法解析的 front-matter 行：${rawLine}`);
    }
  }
  return { frontmatter: data, body };
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function validateFrontmatter(frontmatter) {
  const missing = REQUIRED_FRONTMATTER_KEYS.filter(
    (key) => frontmatter[key] === undefined || frontmatter[key] === null || frontmatter[key] === "",
  );
  if (missing.length > 0) {
    throw new ParserError("FRONTMATTER_INVALID", `front-matter 缺少必填字段：${missing.join(", ")}`, {
      missing,
      required: REQUIRED_FRONTMATTER_KEYS,
    });
  }
  if (typeof frontmatter.reviewed !== "boolean") {
    throw new ParserError("FRONTMATTER_INVALID", "front-matter 字段 reviewed 必须是 true/false");
  }
  if (
    frontmatter.parseConfidence !== undefined &&
    (typeof frontmatter.parseConfidence !== "number" ||
      frontmatter.parseConfidence < 0 ||
      frontmatter.parseConfidence > 1)
  ) {
    throw new ParserError("FRONTMATTER_INVALID", "front-matter 字段 parseConfidence 必须是 0..1 数值");
  }
}

/** 把 GFM 表格行切成单元格数组。 */
function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** 解析正文为中间形态块（尚未编号/映射页码）。 */
function parseBodyBlocks(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  const tables = [];
  const warnings = [];
  let current = null; // 可吸收续行的块：paragraph / policy_article / policy_clause

  const flush = () => {
    current = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") {
      flush();
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      flush();
      blocks.push({ kind: "heading", level: headingMatch[1].length, raw: headingMatch[2].trim() });
      i += 1;
      continue;
    }

    if (TABLE_LINE_RE.test(trimmed)) {
      flush();
      const tableLines = [];
      while (i < lines.length && TABLE_LINE_RE.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      if (tableLines.length < 2 || !TABLE_SEPARATOR_RE.test(tableLines[1])) {
        warnings.push({
          code: "TABLE_MALFORMED",
          message: `疑似表格但缺少分隔行（| --- |），按普通段落处理：${tableLines[0].slice(0, 40)}`,
        });
        current = { kind: "paragraph", raw: tableLines.join("\n") };
        blocks.push(current);
        continue;
      }
      const header = splitTableRow(tableLines[0]);
      const rows = tableLines.slice(2).map(splitTableRow);
      const raw = tableLines.join("\n");
      const block = { kind: "table", raw, tableIndex: tables.length };
      blocks.push(block);
      tables.push({
        header,
        rows,
        normalized: [header, ...rows].map((row) => row.map(normalizeText).join(" | ")).join("\n"),
      });
      continue;
    }

    if (POLICY_ARTICLE_RE.test(trimmed)) {
      current = { kind: "policy_article", raw: trimmed };
      blocks.push(current);
      i += 1;
      continue;
    }
    if (POLICY_CLAUSE_RE.test(trimmed)) {
      current = { kind: "policy_clause", raw: trimmed };
      blocks.push(current);
      i += 1;
      continue;
    }
    if (FIGURE_CAPTION_RE.test(trimmed)) {
      flush();
      blocks.push({ kind: "figure_caption", raw: trimmed });
      i += 1;
      continue;
    }

    // 普通行：段内续行并入前一块；否则开新 paragraph
    if (current && !startsStructuralBlock(trimmed)) {
      current.raw += `\n${trimmed}`;
    } else {
      current = { kind: "paragraph", raw: trimmed };
      blocks.push(current);
    }
    i += 1;
  }

  return { blocks, tables, warnings };
}

/** 应用 pageMap：每个锚点生效至下一个锚点；锚点前与未覆盖块 pageIndex=null 并记 warning。 */
function applyPageMap(blocks, pageMap, warnings) {
  const pageOf = new Array(blocks.length).fill(null);
  if (!Array.isArray(pageMap) || pageMap.length === 0) {
    warnings.push({
      code: "PAGE_MAP_MISSING",
      message: "front-matter 未提供 pageMap，全部 block 的 pageIndex/pageLabel 置 null",
    });
    return { pageOf, pages: [] };
  }

  const anchors = [];
  for (const entry of pageMap) {
    if (typeof entry !== "object" || entry === null) {
      warnings.push({ code: "PAGE_ANCHOR_INVALID", message: `pageMap 条目必须是对象：${JSON.stringify(entry)}` });
      continue;
    }
    if (!Number.isInteger(entry.pageIndex) || entry.pageIndex < 0) {
      warnings.push({ code: "PAGE_ANCHOR_INVALID", message: `pageMap 条目缺少合法 pageIndex：${JSON.stringify(entry)}` });
      continue;
    }
    let anchorIndex = -1;
    if (typeof entry.heading === "string") {
      anchorIndex = blocks.findIndex((b) => b.kind === "heading" && b.raw === entry.heading);
      if (anchorIndex === -1) {
        warnings.push({ code: "PAGE_ANCHOR_UNMATCHED", message: `pageMap 锚点 heading 未匹配任何标题块：${entry.heading}` });
        continue;
      }
    } else if (Number.isInteger(entry.block)) {
      anchorIndex = entry.block - 1;
      if (anchorIndex < 0 || anchorIndex >= blocks.length) {
        warnings.push({ code: "PAGE_ANCHOR_UNMATCHED", message: `pageMap 锚点 block 序号越界：${entry.block}` });
        continue;
      }
    } else {
      warnings.push({ code: "PAGE_ANCHOR_INVALID", message: `pageMap 条目缺少 heading 或 block 锚点：${JSON.stringify(entry)}` });
      continue;
    }
    anchors.push({ index: anchorIndex, pageIndex: entry.pageIndex, pageLabel: String(entry.pageLabel ?? entry.pageIndex + 1) });
  }
  anchors.sort((a, b) => a.index - b.index);

  let unmapped = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    let active = null;
    for (const anchor of anchors) {
      if (anchor.index <= i) active = anchor;
      else break;
    }
    if (active) {
      pageOf[i] = { pageIndex: active.pageIndex, pageLabel: active.pageLabel };
    } else {
      unmapped += 1;
    }
  }
  if (unmapped > 0) {
    warnings.push({
      code: "PAGE_UNMAPPED",
      message: `${unmapped} 个 block 位于首个 pageMap 锚点之前，pageIndex/pageLabel 置 null`,
    });
  }

  const seen = new Map();
  for (const entry of pageOf) {
    if (entry && !seen.has(entry.pageIndex)) {
      seen.set(entry.pageIndex, { pageIndex: entry.pageIndex, pageLabel: entry.pageLabel });
    }
  }
  const pages = [...seen.values()].sort((a, b) => a.pageIndex - b.pageIndex);
  return { pageOf, pages };
}

export function createManualMarkdownParser() {
  return {
    id: "manual-markdown",
    version: MANUAL_MARKDOWN_VERSION,

    capabilities() {
      return {
        blockTypes: ["heading", "paragraph", "policy_article", "policy_clause", "table", "figure_caption"],
        bbox: false,
        bboxCoordinateSystem: "none",
        tables: true,
        readingOrder: true,
        pageLabels: true,
      };
    },

    /**
     * @param {{ fileRef: string, fileHash?: string, options?: object }} input
     * fileRef 为 Markdown 文件路径；fileHash 为原始文件内容哈希（'sha256:<hex>' 或裸 hex），
     * 缺省时由 adapter 读取文件实测计算。原始文件不复制进 SQLite，只记定位与哈希。
     */
    async parse(input) {
      if (typeof input?.fileRef !== "string" || input.fileRef.length === 0) {
        throw new ParserError("PARSE_INPUT_INVALID", "ParseInput.fileRef 必须是非空路径字符串");
      }
      const source = await readFile(input.fileRef, "utf8");

      let originalFileHash = input.fileHash;
      if (originalFileHash === undefined || originalFileHash === null) {
        originalFileHash = sha256Hex(source);
      } else if (/^[0-9a-f]{64}$/.test(originalFileHash)) {
        originalFileHash = `sha256:${originalFileHash}`;
      } else if (!/^sha256:[0-9a-f]{64}$/.test(originalFileHash)) {
        throw new ParserError("PARSE_INPUT_INVALID", "ParseInput.fileHash 必须是 sha256 十六进制（可带 'sha256:' 前缀）");
      }

      const { frontmatter, body } = parseFrontmatter(source);
      validateFrontmatter(frontmatter);

      const { blocks: rawBlocks, tables: rawTables, warnings } = parseBodyBlocks(body);
      const { pageOf, pages } = applyPageMap(rawBlocks, frontmatter.pageMap, warnings);

      let lastArticleId = null;
      const blocks = rawBlocks.map((raw, index) => {
        const blockId = `b${String(index + 1).padStart(4, "0")}`;
        let parentBlockId = null;
        if (raw.kind === "policy_article") {
          lastArticleId = blockId;
        } else if (raw.kind === "policy_clause") {
          parentBlockId = lastArticleId;
        }
        const page = pageOf[index];
        const normalizedText =
          raw.kind === "table" ? rawTables[raw.tableIndex].normalized : normalizeText(raw.raw);
        return {
          blockId,
          blockType: raw.kind,
          readingOrder: index,
          parentBlockId,
          pageIndex: page ? page.pageIndex : null,
          pageLabel: page ? page.pageLabel : null,
          bbox: null,
          bboxCoordinateSystem: "none",
          contentRaw: raw.raw,
          normalizedText,
          contentHash: sha256Hex(raw.raw),
        };
      });

      const tables = rawTables.map((table, tableIndex) => {
        const ownerIndex = rawBlocks.findIndex((b) => b.kind === "table" && b.tableIndex === tableIndex);
        const page = pageOf[ownerIndex];
        return {
          tableId: `t${String(tableIndex + 1).padStart(4, "0")}`,
          blockId: blocks[ownerIndex].blockId,
          header: table.header,
          rows: table.rows,
          pageIndex: page ? page.pageIndex : null,
          pageLabel: page ? page.pageLabel : null,
        };
      });

      const reviewStatus = frontmatter.reviewed ? "reviewed" : "unreviewed";
      const parseConfidence =
        frontmatter.parseConfidence !== undefined
          ? frontmatter.parseConfidence
          : frontmatter.reviewed
            ? 0.9
            : 0.7;
      if (!frontmatter.reviewed) {
        warnings.push({
          code: "REVIEW_PENDING",
          message: "front-matter reviewed=false：该校正稿未经复核，下游机械门禁应记 WARNING 而非 PASSED",
        });
      }

      const parsed = {
        schemaVersion: "1.0.0",
        documentMeta: {
          docId: String(frontmatter.docId),
          title: String(frontmatter.title),
          sourceType: String(frontmatter.sourceType),
          correctedBy: String(frontmatter.correctedBy),
          correctedAt: String(frontmatter.correctedAt),
          reviewStatus,
          source: input.fileRef,
        },
        parser: "manual-markdown",
        parserVersion: MANUAL_MARKDOWN_VERSION,
        pages,
        blocks,
        tables,
        warnings,
        parseConfidence,
        originalFileHash,
        parsedAt: new Date().toISOString(),
      };

      // 产出必须过契约校验；不合格直接抛错，不交付半成品。
      return validateParsedDocument(parsed);
    },
  };
}
