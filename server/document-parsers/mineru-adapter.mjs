/**
 * mineru adapter —— 契约完整的候选解析器桩。
 *
 * 当前环境（本机 macOS、零 npm 依赖纪律、本地优先）无法安装 MinerU
 * （依赖 Python 环境 + 深度模型权重，通常还需 GPU）。本 adapter 只做两件事：
 *   1. capabilities() 如实声明 MinerU 兑现后的能力；
 *   2. parse() 检测本机可执行环境，不可用即抛 PARSER_UNAVAILABLE 并写明阻塞原因。
 * 绝不返回编造的解析结果。
 */

import { execFileSync } from "node:child_process";
import { ParserError, ParserUnavailableError } from "./parser-contract.mjs";

export const MINERU_ADAPTER_VERSION = "0.1.0";

const BLOCKED_REASON =
  "MinerU 需要 Python 环境与模型权重（通常需 GPU），本机未安装且本地优先纪律禁止装入系统环境；" +
  "按契约只保留 adapter 桩与阻塞记录，不伪造解析结果。";

/** 探测本机是否存在 mineru 可执行文件（which → whereis 兜底）。 */
export function detectMineruEnvironment() {
  for (const cmd of ["which", "whereis"]) {
    try {
      const out = execFileSync(cmd, ["mineru"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      // whereis 未找到时输出形如 "mineru:"（无路径）
      const found = out
        .split(/\s+/)
        .find((token) => token.includes("/") && token.endsWith("mineru"));
      if (found) return { available: true, executablePath: found, reason: null };
    } catch {
      // which 未找到时以非零码退出；继续尝试下一个探测器
    }
  }
  return { available: false, executablePath: null, reason: BLOCKED_REASON };
}

export function createMineruAdapter() {
  return {
    id: "mineru",
    version: MINERU_ADAPTER_VERSION,

    /** MinerU 兑现后的预期能力（学术 PDF 版面/公式/表格强）。 */
    capabilities() {
      return {
        blockTypes: ["heading", "paragraph", "table", "figure_caption"],
        bbox: true,
        bboxCoordinateSystem: "pdf-points",
        tables: true,
        readingOrder: true,
        pageLabels: true,
      };
    },

    async parse(input) {
      const env = detectMineruEnvironment();
      if (!env.available) {
        throw new ParserUnavailableError(`mineru 解析器不可用：${env.reason}`, {
          parser: "mineru",
          fileRef: input?.fileRef ?? null,
          executablePath: null,
        });
      }
      // 可执行文件存在但本 adapter 尚未实现调用管道；诚实报错，不返回半成品。
      throw new ParserError(
        "PARSER_UNAVAILABLE",
        `检测到 mineru 可执行文件（${env.executablePath}），但 adapter 调用管道尚未实现；按纪律不伪造解析结果。`,
        { parser: "mineru", executablePath: env.executablePath },
      );
    },
  };
}
