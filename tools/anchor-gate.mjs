/* ============================================================
   批注锚定门禁 · anchor-gate
   ------------------------------------------------------------
   把模型产出的批注"钉"回教师稿件的确定性组件。核心立场：
   **不信任模型填写的任何定位信息**——targetEnv 由模型声明但需被证伪，
   segmentKey 一律按最终命中位置重新推导，sourceExcerpt 一律以原文为准。

   三级门禁：
     1. exact             摘录逐字出现在 targetEnv 原文中 → 直接采用
     2. normalized-exact  仅消除格式噪声后**唯一**命中，再按字符位置映射回原文，
                          保存的仍是原文真实片段（因此锚定强度未下降）
     3. 失败              未命中 / 多处命中 / 出现在别的环节 / 过短 → 不得显示为已锚定

   刻意不做的事：
     · 不做模糊匹配、不做编辑距离、不做语义相似
     · 摘录出现在别的环节时返回 wrong_env，**不偷偷帮模型改环节编号**
     · 多处命中时不猜"最可能的那个"

   纯函数、无 IO、无依赖，供服务端调用与单测。normalizationVersion 变更时
   历史批注的 anchorMethod 需重新评估，故一并落库。
   ============================================================ */

export const NORMALIZATION_VERSION = 1;
export const MIN_EXCERPT_CHARS = 12;
export const MIN_COMPLETE_SEGMENT_CHARS = 10;

/* ---- 规范化：只处理格式噪声 ---------------------------------------- */
// 全角→半角标点；空白丢弃。中文正文一律原样保留。
const PUNCT_MAP = new Map(Object.entries({
  "：": ":", "，": ",", "。": ".", "；": ";", "！": "!", "？": "?",
  "（": "(", "）": ")", "【": "[", "】": "]", "《": "<", "》": ">",
  "、": ",", "—": "-", "－": "-", "～": "~", "·": "·",
  "“": '"', "”": '"', "‘": "'", "’": "'",
}));

function normalizeChar(ch) {
  if (/\s/.test(ch)) return "";                 // 空白不参与比对
  if (PUNCT_MAP.has(ch)) return PUNCT_MAP.get(ch);
  // 全角字母数字 → 半角
  const code = ch.codePointAt(0);
  if (code >= 0xff01 && code <= 0xff5e) return String.fromCodePoint(code - 0xfee0);
  return ch;
}

/**
 * 找出环节文本里**重复出现**的段落标签（如 env04 的三处「待核实来源：」）。
 * 模型复述时常整体省略这类标签,属规格允许消除的格式噪声;
 * 只对重复≥2 次的标签生效,避免误删承载信息的唯一标签。
 */
export function repeatedLabels(envText) {
  const counts = new Map();
  const re = /(?:^|·)\s*([^：:·]{2,12})[：:]/g;
  let m;
  while ((m = re.exec(envText))) {
    const label = m[1].trim();
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= 2).map(([label]) => label));
}

/**
 * 规范化并保留到原文的字符位置映射。
 * @param {string} text
 * @param {Set<string>} dropLabels 需当作噪声消除的重复段落标签
 * @returns {{ norm: string, map: number[] }} map[i] = norm[i] 在原文中的下标
 */
export function normalizeWithMap(text, dropLabels = new Set()) {
  const out = [];
  const map = [];
  let i = 0;
  while (i < text.length) {
    // 命中重复段落标签（含其后的冒号）→ 整体跳过
    let skipped = 0;
    for (const label of dropLabels) {
      const probe = text.slice(i, i + label.length + 1);
      if (probe === label + "：" || probe === label + ":") { skipped = label.length + 1; break; }
    }
    if (skipped) { i += skipped; continue; }

    const n = normalizeChar(text[i]);
    if (n) { out.push(n); map.push(i); }
    i++;
  }
  return { norm: out.join(""), map };
}

// 摘录两端的标点/标签残留（模型常见的复述噪声）先剥掉再比对
function trimEdgePunct(norm) {
  return norm.replace(/^[\s:;,.·、\-—"'"'()\[\]]+/, "").replace(/[\s:;,.·、\-—"'"'()\[\]]+$/, "");
}

function countCjk(text) {
  return (text.match(/[一-鿿]/g) || []).length;
}

/* ---- segmentKey 推导：按命中位置反查所在段落，不信模型 --------------- */
// 实践包环节文本形如： "情境导入：… · 任务指令：… · 输出要求：…"
export function deriveSegmentKey(envText, hitStart) {
  const parts = segmentRanges(envText);
  for (const { start, end } of parts) {
    if (hitStart >= start && hitStart < end) {
      const chunk = envText.slice(start, end);
      const label = chunk.match(/^\s*([^：:]{2,12})[：:]/);
      return label ? label[1].trim() : chunk.slice(0, 12).trim();
    }
  }
  return null;
}

function segmentRanges(envText) {
  const parts = [];
  const re = /\s·\s/g;
  let prev = 0, m;
  while ((m = re.exec(envText))) {
    parts.push({ start: prev, end: m.index });
    prev = re.lastIndex;
  }
  parts.push({ start: prev, end: envText.length });
  return parts;
}

/**
 * 若规范化命中恰好覆盖一个或多个完整条目，将保存范围扩展到条目边界。
 * 这样被模型省略的首个重复标签也会从原文中恢复，而不是只恢复内部标签。
 */
function expandToWholeSegments(envText, hit, normalizedExcerpt, dropLabels) {
  const parts = segmentRanges(envText);
  const firstIndex = parts.findIndex(({ start, end }) => hit.start >= start && hit.start < end);
  const lastIndex = parts.findIndex(({ start, end }) => hit.end - 1 >= start && hit.end - 1 < end);
  if (firstIndex < 0 || lastIndex < firstIndex) return null;
  const start = parts[firstIndex].start;
  const end = parts[lastIndex].end;
  const wholeNorm = trimEdgePunct(normalizeWithMap(envText.slice(start, end), dropLabels).norm);
  if (wholeNorm !== normalizedExcerpt) return null;
  return { start, end, segmentCount: lastIndex - firstIndex + 1 };
}

/**
 * 为完整短条目做全稿唯一性检查。这里只用于消歧，不用于定位：
 * 比较时额外剥离每个条目自己的首部标签，避免同一正文换了标签后漏判重复。
 */
function completeSegmentOccurrences(pack, normalizedExcerpt) {
  const occurrences = [];
  for (const [envKey, envText] of Object.entries(pack)) {
    const dropLabels = repeatedLabels(envText);
    for (const { start, end } of segmentRanges(envText)) {
      const raw = envText.slice(start, end);
      const withoutOwnLabel = raw.replace(/^\s*[^：:·]{2,12}[：:]/, "");
      const candidates = new Set([
        trimEdgePunct(normalizeWithMap(raw, dropLabels).norm),
        trimEdgePunct(normalizeWithMap(withoutOwnLabel).norm),
      ]);
      if (candidates.has(normalizedExcerpt)) occurrences.push({ envKey, start, end });
    }
  }
  return occurrences;
}

/* ---- 简易内容散列：用于日后检测稿件漂移 ----------------------------- */
export function hashText(text) {
  // FNV-1a 32bit —— 无需 crypto，纯函数、跨端一致；仅用于漂移检测，不作安全用途
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.codePointAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "fnv1a32:" + h.toString(16).padStart(8, "0");
}

/* ---- 在单个环节文本内定位 ------------------------------------------- */
function locateInEnv(envText, excerpt) {
  // ① 精确命中优先
  const exactIdx = envText.indexOf(excerpt);
  if (exactIdx >= 0) {
    if (envText.indexOf(excerpt, exactIdx + 1) >= 0) return { status: "ambiguous" };
    return { status: "exact", start: exactIdx, end: exactIdx + excerpt.length };
  }

  // ② 规范化定位：两侧同法规范化后必须**唯一**命中
  const drop = repeatedLabels(envText);
  const src = normalizeWithMap(envText, drop);
  const exc = trimEdgePunct(normalizeWithMap(excerpt, drop).norm);
  if (!exc) return { status: "not_found" };

  const first = src.norm.indexOf(exc);
  if (first < 0) return { status: "not_found" };
  if (src.norm.indexOf(exc, first + 1) >= 0) return { status: "ambiguous" };

  // 按字符位置映射回原文——保存的是原文真实片段，不是模型的复述
  const start = src.map[first];
  const end = src.map[first + exc.length - 1] + 1;
  return { status: "normalized-exact", start, end, normalizedLength: exc.length };
}

/**
 * 门禁主入口。
 * @param {{targetEnv:string, sourceExcerpt:string, segmentKey?:string}} annotation 模型产出
 * @param {Record<string,string>} pack 当前九环节稿件
 * @param {number} sourceRevision 当前 Store 修订号
 * @returns 已锚定记录 或 { ok:false, reason }
 */
export function anchorAnnotation(annotation, pack, sourceRevision) {
  const targetEnv = annotation?.targetEnv;
  const excerptRaw = (annotation?.sourceExcerpt || "").trim();

  if (!targetEnv || !pack[targetEnv]) return { ok: false, reason: "unknown_env", targetEnv };
  if (!excerptRaw) return { ok: false, reason: "empty_excerpt", targetEnv };

  const envText = pack[targetEnv];
  const hit = locateInEnv(envText, excerptRaw);

  if (hit.status === "ambiguous") {
    return { ok: false, reason: "ambiguous", targetEnv };
  }

  if (hit.status !== "exact" && hit.status !== "normalized-exact") {
    // 先检查跨环节错引，再做长度门禁；短摘录也不能掩盖 wrong_env。
    for (const [key, text] of Object.entries(pack)) {
      if (key === targetEnv) continue;
      const elsewhere = locateInEnv(text, excerptRaw).status;
      if (elsewhere === "exact" || elsewhere === "normalized-exact" || elsewhere === "ambiguous") {
        return { ok: false, reason: "wrong_env", targetEnv, actuallyIn: key };
      }
    }
    return { ok: false, reason: "not_found", targetEnv };
  }

  const dropLabels = repeatedLabels(envText);
  const effective = trimEdgePunct(normalizeWithMap(excerptRaw, dropLabels).norm);
  const effectiveCjk = countCjk(effective);
  const wholeSegments = expandToWholeSegments(envText, hit, effective, dropLabels);
  const shortCompleteSegment = effectiveCjk >= MIN_COMPLETE_SEGMENT_CHARS
    && effectiveCjk < MIN_EXCERPT_CHARS
    && wholeSegments?.segmentCount === 1;

  if (effectiveCjk < MIN_EXCERPT_CHARS && !shortCompleteSegment) {
    return { ok: false, reason: "too_short", targetEnv, effectiveCjk };
  }

  // 10–11 字完整短条目只有在整个实践包中唯一时才可锚定。
  if (shortCompleteSegment) {
    const occurrences = completeSegmentOccurrences(pack, effective);
    if (occurrences.length !== 1 || occurrences[0].envKey !== targetEnv) {
      const matchingEnvs = [...new Set(occurrences.map(({ envKey }) => envKey))];
      return { ok: false, reason: "ambiguous_env", targetEnv, matchingEnvs, matchCount: occurrences.length };
    }
  }

  const canonicalStart = wholeSegments?.start ?? hit.start;
  const canonicalEnd = wholeSegments?.end ?? hit.end;
  return {
    ok: true,
    targetEnv,
    segmentKey: deriveSegmentKey(envText, canonicalStart), // ← 按最终原文位置重新推导
    sourceExcerpt: envText.slice(canonicalStart, canonicalEnd),
    sourceRevision,
    sourceHash: hashText(envText),
    anchorMethod: hit.status,
    anchorBasis: wholeSegments
      ? (wholeSegments.segmentCount === 1 ? "complete-segment" : "complete-segments")
      : "excerpt",
    effectiveCjk,
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

/** 交叉引用同样过门禁；任一条不过则整条批注不得标为已锚定 */
export function anchorCrossReferences(crossRefs, pack, sourceRevision) {
  const results = (crossRefs || []).map((ref) =>
    anchorAnnotation({ targetEnv: ref.envKey, sourceExcerpt: ref.sourceExcerpt }, pack, sourceRevision));
  return { allOk: results.every((r) => r.ok), results };
}
