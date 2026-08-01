#!/usr/bin/env node
/* 锚定门禁单测 —— 用 2026-08-01 实测中真实出现的两类失败当用例。
   纯函数、不调模型，可随 npm run check 常跑。 */
import assert from "node:assert/strict";
import {
  anchorAnnotation, anchorCrossReferences, deriveSegmentKey,
  normalizeWithMap, MIN_EXCERPT_CHARS, MIN_COMPLETE_SEGMENT_CHARS,
  NORMALIZATION_VERSION,
} from "./anchor-gate.mjs";

// 取自运行时真实实践包（第 5 章 · 集采制度）
const PACK = {
  env02: "目标：辨析集采规则与临床替代的冲突点 · 量规核心：证据链完整性 · 角色扮演代入感",
  env04: "待核实来源：具体省份集采执行细则 · 待核实来源：某仿制药临床替代率数据 · 待核实来源：医院药事会最新会议纪要",
  env05: "情境导入：模拟医保局发布某品种集采结果 · 任务指令：分组扮演医院、患者、药企制定替代方案 · 输出要求：列出替代优先级及理由",
};
const REV = 12;

/* ① 精确命中 */
{
  const r = anchorAnnotation(
    { targetEnv: "env05", sourceExcerpt: "任务指令：分组扮演医院、患者、药企制定替代方案" }, PACK, REV);
  assert.equal(r.ok, true);
  assert.equal(r.anchorMethod, "exact");
  assert.equal(r.segmentKey, "任务指令", "segmentKey 应按命中位置推导");
  assert.equal(r.sourceRevision, REV);
  assert.match(r.sourceHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(r.normalizationVersion, NORMALIZATION_VERSION);
}

/* ② 实测失败样本 A：模型把三处重复的"待核实来源："标签全部省略 →
      属规格允许消除的格式噪声，规范化定位应救回；
      且保存的必须是**原文**片段（标签带回），不是模型的复述 */
{
  const modelSaid = "具体省份集采执行细则 · 某仿制药临床替代率数据 · 医院药事会最新会议纪要";
  assert.equal(PACK.env04.includes(modelSaid), false, "前提：该串确实不是逐字摘录");
  const r = anchorAnnotation({ targetEnv: "env04", sourceExcerpt: modelSaid }, PACK, REV);
  assert.equal(r.ok, true, "重复段落标签缺失应被规范化定位救回");
  assert.equal(r.anchorMethod, "normalized-exact");
  assert.equal(PACK.env04.includes(r.sourceExcerpt), true, "保存的必须逐字出现在原文中");
  assert.equal(r.sourceExcerpt,
    PACK.env04,
    "覆盖完整条目时应扩展到原文边界，连首个被省略的标签一起恢复");
  assert.equal(r.anchorBasis, "complete-segments");
  assert.equal(r.segmentKey, "待核实来源");
}

/* ②b 唯一标签不得被当噪声删除（只有重复≥2 次的才算格式噪声） */
{
  const r = anchorAnnotation(
    { targetEnv: "env05", sourceExcerpt: "模拟医保局发布某品种集采结果 · 任务指令：分组扮演医院" }, PACK, REV);
  assert.equal(r.ok, true);
  assert.equal(r.sourceExcerpt.startsWith("模拟医保局"), true, "唯一标签「情境导入：」不应被吞掉");
}

/* ③ 实测失败样本 B：env02/env04 张冠李戴 → 必须 wrong_env，不许偷偷改环节号 */
{
  const r = anchorAnnotation(
    { targetEnv: "env02", sourceExcerpt: "待核实来源：具体省份集采执行细则" }, PACK, REV);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "wrong_env", "跨环节错引必须被拦住");
  assert.equal(r.actuallyIn, "env04");
  assert.equal("segmentKey" in r, false, "失败时不得产出锚定字段");
}

/* ④ 多处命中 → 不猜 */
{
  const r = anchorAnnotation({ targetEnv: "env04", sourceExcerpt: "待核实来源：" }, PACK, REV);
  assert.equal(r.ok, false);
  assert.notEqual(r.reason, "exact");
}

/* ⑤ 过短 → 拒绝（硬限制 ≥ MIN_EXCERPT_CHARS 个中文字符） */
{
  const r = anchorAnnotation({ targetEnv: "env05", sourceExcerpt: "情境导入" }, PACK, REV);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too_short");
  assert.ok(r.effectiveCjk < MIN_EXCERPT_CHARS);
}

/* ⑥ 原文中根本不存在 → not_found，绝不编造 */
{
  const r = anchorAnnotation(
    { targetEnv: "env05", sourceExcerpt: "问题链：Q1 你最直觉的判断是什么？请说明理由" }, PACK, REV);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_found");
}

/* ⑦ 全角/半角与空白噪声 → 规范化定位 */
{
  const r = anchorAnnotation(
    { targetEnv: "env05", sourceExcerpt: "输出要求:列出替代优先级及理由" }, PACK, REV);
  assert.equal(r.ok, true);
  assert.equal(r.anchorMethod, "normalized-exact");
  assert.equal(r.sourceExcerpt, "输出要求：列出替代优先级及理由", "冒号应还原为原文的全角");
}

/* ⑧ 交叉引用：任一条不过 → 整体不过 */
{
  const good = [{ envKey: "env04", sourceExcerpt: "待核实来源：某仿制药临床替代率数据 · 待核实来源：医院药事会最新会议纪要" }];
  const bad = [...good, { envKey: "env02", sourceExcerpt: "待核实来源：医院药事会最新会议纪要 · 待核实来源：具体省份集采执行细则" }];
  assert.equal(anchorCrossReferences(good, PACK, REV).allOk, true);
  assert.equal(anchorCrossReferences(bad, PACK, REV).allOk, false, "交叉引用错引必须整条否决");
}

/* ⑧b 受限例外：10–11 字只有在唯一覆盖一个完整条目时才可锚定。 */
{
  const single = anchorAnnotation(
    { targetEnv: "env04", sourceExcerpt: "某仿制药临床替代率数据" }, PACK, REV);
  assert.equal(single.ok, true);
  assert.equal(single.effectiveCjk, 11, "标签不计入有效长度");
  assert.equal(single.anchorMethod, "exact", "正文自身逐字存在时仍应优先归为精确命中");
  assert.equal(single.anchorBasis, "complete-segment");
  assert.equal(single.sourceExcerpt, "待核实来源：某仿制药临床替代率数据", "必须回写含标签的完整原文条目");
  assert.ok(single.effectiveCjk >= MIN_COMPLETE_SEGMENT_CHARS);
  assert.ok(single.effectiveCjk < MIN_EXCERPT_CHARS);
}

/* ⑧c 同样长度的条目内部子串不享受完整条目例外。 */
{
  const partial = anchorAnnotation(
    { targetEnv: "env04", sourceExcerpt: "仿制药临床替代率数据" }, PACK, REV);
  assert.equal(partial.ok, false);
  assert.equal(partial.reason, "too_short");
  assert.equal(partial.effectiveCjk, 10);
}

/* ⑧d 完整短条目若跨环节重复，必须 ambiguous_env，不信模型声明的 targetEnv。 */
{
  const duplicated = {
    ...PACK,
    env09: "资产沉淀：形成案例卡 · 证据来源：某仿制药临床替代率数据",
  };
  const result = anchorAnnotation(
    { targetEnv: "env04", sourceExcerpt: "某仿制药临床替代率数据" }, duplicated, REV);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ambiguous_env");
  assert.deepEqual(result.matchingEnvs, ["env04", "env09"]);
  assert.equal(result.matchCount, 2, "不同标签下的同一短条目正文也必须计为重复");
}

/* ⑨ 规范化映射不得偏移 */
{
  const { norm, map } = normalizeWithMap("情境导入：  模拟医保局");
  const i = norm.indexOf("模拟医保局");
  assert.equal("情境导入：  模拟医保局".slice(map[i], map[i] + 5), "模拟医保局", "位置映射必须精确");
}

/* ⑩ segmentKey 落在正确段落 */
{
  assert.equal(deriveSegmentKey(PACK.env05, PACK.env05.indexOf("列出替代")), "输出要求");
  assert.equal(deriveSegmentKey(PACK.env05, PACK.env05.indexOf("分组扮演")), "任务指令");
}

console.log("verify-anchor-gate: ok");
