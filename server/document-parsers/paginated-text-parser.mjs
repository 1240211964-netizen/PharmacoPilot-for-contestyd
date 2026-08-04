/**
 * paginated-text adapter —— 机器抽取稿（pypdf/HTML 抽取）的确定性解析器，不依赖外部环境。
 *
 * 输入：带 YAML front-matter 的纯文本抽取稿（knowledge-sources/organization-design/ 各层格式）：
 *   ---
 *   docId: …        # 必填
 *   title: …        # 必填
 *   sourceType: …   # 必填
 *   correctedBy: …  # 可选（缺省记 "machine-extract"）
 *   reviewed: false # 可选（缺省 false → reviewStatus=unreviewed）
 *   ---
 *   正文（两种形态，按是否存在页标记自动判定，不混合）：
 *
 * 形态 A（分页稿，theory/pharma-intl/company 年报 PDF 抽取）：
 *   正文以 `<!-- page N -->`（独占一行，N 为 1 起页码）分页；每页文本切为一个 block：
 *   block_type='paragraph'、page_index=N、page_label="N"、parentBlockId=null、content_hash=sha256。
 *   首个页标记之前的非空前言文本（如机器抽取说明）单成一块，page_index=null 并记 warning。
 *
 * 形态 B（无页标记稿，company 10-K 行号锚变体 / pharma-cn 结构化 md 的纯文本摄入）：
 *   按空行分段，每段一个 block；page_index=null、page_label=null，
 *   行号锚点（1 起，相对整个文件，含 front-matter）以 `L<起>-<止>` 记入 block.anchor，
 *   由摄入服务落进 content_blocks.parser_metadata_json.anchor。
 *
 * 两形态均产出过 validateParsedDocument 的 ParsedDocument；确定性：同文件同输出。
 */

import { readFile } from "node:fs/promises";
import { ParserError, sha256Hex, validateParsedDocument } from "./parser-contract.mjs";
import { normalizeText, parseFrontmatter } from "./manual-markdown-parser.mjs";

export const PAGINATED_TEXT_VERSION = "1.0.0";

const REQUIRED_FRONTMATTER_KEYS = ["docId", "title", "sourceType"];
const PAGE_MARKER_RE = /^<!--\s*page\s+(\d+)\s*-->\s*$/;

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
  if (frontmatter.reviewed !== undefined && typeof frontmatter.reviewed !== "boolean") {
    throw new ParserError("FRONTMATTER_INVALID", "front-matter 字段 reviewed 必须是 true/false");
  }
}

/**
 * 定位正文起始行：front-matter 结束围栏（第二个独占一行的 ---）之后的下一行。
 * 返回 { bodyLines, bodyStartLine }，行号为 1 起、相对整个文件。
 */
function splitBodyLines(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new ParserError("FRONTMATTER_MISSING", "paginated-text 输入必须以 YAML front-matter（--- 围栏）开头");
  }
  const lines = normalized.split("\n");
  let fence = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      fence = i;
      break;
    }
  }
  if (fence === -1) {
    throw new ParserError("FRONTMATTER_MISSING", "front-matter 缺少结束围栏 ---");
  }
  return { bodyLines: lines.slice(fence + 1), bodyStartLine: fence + 2 };
}

/** 形态 A：按 `<!-- page N -->` 切页块。 */
function parsePagedBlocks(bodyLines, bodyStartLine, warnings) {
  const segments = []; // { pageNumber|null, lines, startLine, endLine }
  let current = { pageNumber: null, lines: [], startLine: bodyStartLine, endLine: bodyStartLine - 1 };
  for (let i = 0; i < bodyLines.length; i += 1) {
    const lineNo = bodyStartLine + i;
    const marker = bodyLines[i].match(PAGE_MARKER_RE);
    if (marker) {
      segments.push(current);
      current = { pageNumber: Number(marker[1]), lines: [], startLine: lineNo + 1, endLine: lineNo };
      continue;
    }
    current.lines.push(bodyLines[i]);
    current.endLine = lineNo;
  }
  segments.push(current);

  const blocks = [];
  let skippedEmpty = 0;
  for (const segment of segments) {
    const raw = segment.lines.join("\n").trim();
    if (raw === "") {
      if (segment.pageNumber !== null) skippedEmpty += 1;
      continue;
    }
    if (segment.pageNumber === null) {
      warnings.push({
        code: "PAGE_MARKER_PREAMBLE",
        message: "首个页标记之前存在非空前言文本，单成一块且 pageIndex/pageLabel 置 null",
      });
    }
    blocks.push({
      raw,
      pageIndex: segment.pageNumber,
      pageLabel: segment.pageNumber === null ? null : String(segment.pageNumber),
      anchor: `L${segment.startLine}-L${segment.endLine}`,
    });
  }
  if (skippedEmpty > 0) {
    warnings.push({ code: "EMPTY_PAGE", message: `${skippedEmpty} 个页标记下无文本，未生成 block` });
  }

  const seen = new Map();
  for (const block of blocks) {
    if (block.pageIndex !== null && !seen.has(block.pageIndex)) {
      seen.set(block.pageIndex, { pageIndex: block.pageIndex, pageLabel: block.pageLabel });
    }
  }
  const pages = [...seen.values()].sort((a, b) => a.pageIndex - b.pageIndex);
  return { blocks, pages };
}

/** 形态 B：按空行分段，行号锚点记入 block.anchor。 */
function parseParagraphBlocks(bodyLines, bodyStartLine, warnings) {
  const blocks = [];
  let current = null; // { lines, startLine, endLine }
  const flush = () => {
    if (!current) return;
    const raw = current.lines.join("\n").trim();
    if (raw !== "") {
      blocks.push({ raw, pageIndex: null, pageLabel: null, anchor: `L${current.startLine}-L${current.endLine}` });
    }
    current = null;
  };
  for (let i = 0; i < bodyLines.length; i += 1) {
    const lineNo = bodyStartLine + i;
    if (bodyLines[i].trim() === "") {
      flush();
      continue;
    }
    if (!current) current = { lines: [], startLine: lineNo, endLine: lineNo };
    current.lines.push(bodyLines[i].trim());
    current.endLine = lineNo;
  }
  flush();
  warnings.push({
    code: "NO_PAGE_MARKERS",
    message: "正文无 <!-- page N --> 页标记，按空行分段、pageIndex/pageLabel 置 null，行号锚点见 block.anchor",
  });
  return { blocks, pages: [] };
}

export function createPaginatedTextParser() {
  return {
    id: "paginated-text",
    version: PAGINATED_TEXT_VERSION,

    capabilities() {
      return {
        blockTypes: ["paragraph"],
        bbox: false,
        bboxCoordinateSystem: "none",
        tables: false,
        readingOrder: true,
        pageLabels: true,
      };
    },

    /**
     * @param {{ fileRef: string, fileHash?: string, options?: object }} input
     * fileRef 为抽取稿路径；fileHash 为该文件内容哈希（'sha256:<hex>' 或裸 hex），
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

      const { frontmatter } = parseFrontmatter(source);
      validateFrontmatter(frontmatter);

      const { bodyLines, bodyStartLine } = splitBodyLines(source);
      const warnings = [];
      const hasPageMarkers = bodyLines.some((line) => PAGE_MARKER_RE.test(line));
      const { blocks: rawBlocks, pages } = hasPageMarkers
        ? parsePagedBlocks(bodyLines, bodyStartLine, warnings)
        : parseParagraphBlocks(bodyLines, bodyStartLine, warnings);

      if (rawBlocks.length === 0) {
        throw new ParserError("PARSE_INPUT_INVALID", "正文未产生任何 block（空文档或全空页）", {
          fileRef: input.fileRef,
        });
      }

      const reviewed = frontmatter.reviewed === true;
      if (!reviewed) {
        warnings.push({
          code: "REVIEW_PENDING",
          message: "front-matter reviewed=false（或缺省）：机器抽取稿未经人工复核，下游机械门禁应记 WARNING 而非 PASSED",
        });
      }

      const blocks = rawBlocks.map((raw, index) => {
        // NUL(U+0000)清洗:PDF 机器抽取稿合法含 NUL(实测益丰年报抽取稿 10 处),
        // 而 SQLite TEXT 经 node:sqlite 绑定时在 NUL 处截断——不清洗则落库的
        // content_raw 是被截断的串,与摄入时按完整串计算的 content_hash 永不一致
        // (引用完整性机检必判伪引用),且 NUL 之后的正文静默丢失。解析侧确定性剔除,
        // 保证 content_hash 与最终落库文本可互相机检;锚点行号不受影响。
        const contentRaw = raw.raw.replace(/\u0000/g, "");
        return {
          blockId: `b${String(index + 1).padStart(4, "0")}`,
          blockType: "paragraph",
          readingOrder: index,
          parentBlockId: null,
          pageIndex: raw.pageIndex,
          pageLabel: raw.pageLabel,
          bbox: null,
          bboxCoordinateSystem: "none",
          contentRaw,
          normalizedText: normalizeText(contentRaw),
          contentHash: sha256Hex(contentRaw),
          anchor: raw.anchor,
        };
      });

      const parsed = {
        schemaVersion: "1.0.0",
        documentMeta: {
          docId: String(frontmatter.docId),
          title: String(frontmatter.title),
          sourceType: String(frontmatter.sourceType),
          correctedBy: String(frontmatter.correctedBy ?? "machine-extract"),
          reviewStatus: reviewed ? "reviewed" : "unreviewed",
          source: input.fileRef,
        },
        parser: "paginated-text",
        parserVersion: PAGINATED_TEXT_VERSION,
        pages,
        blocks,
        tables: [],
        warnings,
        parseConfidence: reviewed ? 0.9 : 0.7,
        originalFileHash,
        parsedAt: new Date().toISOString(),
      };

      // 产出必须过契约校验；不合格直接抛错，不交付半成品。
      return validateParsedDocument(parsed);
    },
  };
}
