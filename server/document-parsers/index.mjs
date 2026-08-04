/**
 * DocumentParser registry：业务侧唯一入口。
 * getParser(name) 取 adapter；listParsers() 列出全部 adapter 及其当前可用性状态。
 */

import { ParserError } from "./parser-contract.mjs";
import { createManualMarkdownParser } from "./manual-markdown-parser.mjs";
import { createPaginatedTextParser } from "./paginated-text-parser.mjs";
import { createMineruAdapter, detectMineruEnvironment } from "./mineru-adapter.mjs";
import { createDoclingAdapter, detectDoclingEnvironment } from "./docling-adapter.mjs";

const factories = new Map([
  ["manual-markdown", createManualMarkdownParser],
  ["paginated-text", createPaginatedTextParser],
  ["mineru", createMineruAdapter],
  ["docling", createDoclingAdapter],
]);

const availabilityProbes = new Map([
  ["manual-markdown", () => ({ available: true, executablePath: null, reason: null })],
  ["paginated-text", () => ({ available: true, executablePath: null, reason: null })],
  ["mineru", detectMineruEnvironment],
  ["docling", detectDoclingEnvironment],
]);

/**
 * @param {string} name 'manual-markdown' | 'paginated-text' | 'mineru' | 'docling'
 * @throws {ParserError} code='PARSER_NOT_FOUND'
 */
export function getParser(name) {
  const factory = factories.get(name);
  if (!factory) {
    throw new ParserError("PARSER_NOT_FOUND", `未注册的解析器：${name}`, {
      registered: [...factories.keys()],
    });
  }
  return factory();
}

/** 列出全部已注册 adapter 及其当前可用性（探测结果，不缓存）。 */
export function listParsers() {
  return [...factories.entries()].map(([id, factory]) => {
    const parser = factory();
    const probe = availabilityProbes.get(id);
    const env = probe ? probe() : { available: false, executablePath: null, reason: "无可用性探测器" };
    return {
      id,
      version: parser.version,
      available: env.available,
      availabilityReason: env.reason,
      executablePath: env.executablePath,
      capabilities: parser.capabilities(),
    };
  });
}

export { validateParsedDocument, ParserError, ParserUnavailableError } from "./parser-contract.mjs";
