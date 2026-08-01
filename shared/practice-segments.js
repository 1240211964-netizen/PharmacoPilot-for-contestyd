/* ============================================================
   PharmacoPilot · Practice Segment Contract
   ------------------------------------------------------------
   课堂实践包在 Store 中始终是 env01–env09 九条短字符串。这个模块只做一件事：
   以教师实际可输入的分隔符（· / ； / ;）切出原文段落，并保留字符位置。

   浏览器卷宗和服务端 anchor gate 共用同一实现，避免“页面看到的段落”和
   “机械门禁认定的段落”再次分叉。
   ============================================================ */
(function attachPracticeSegments(global) {
  "use strict";

  const DELIMITER_RE = /\s*(?:·|；|;)\s*/g;

  function trimRange(text, start, end) {
    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /\s/.test(text[end - 1])) end -= 1;
    return { start, end };
  }

  function segmentRanges(value) {
    const text = String(value || "");
    const ranges = [];
    let previous = 0;
    let match;
    DELIMITER_RE.lastIndex = 0;
    while ((match = DELIMITER_RE.exec(text))) {
      const range = trimRange(text, previous, match.index);
      if (range.end > range.start) ranges.push(range);
      previous = DELIMITER_RE.lastIndex;
    }
    const tail = trimRange(text, previous, text.length);
    if (tail.end > tail.start) ranges.push(tail);
    return ranges;
  }

  function splitSegments(value) {
    const text = String(value || "");
    return segmentRanges(text).map(({ start, end }, index) => ({
      index,
      start,
      end,
      text: text.slice(start, end),
    }));
  }

  function deriveSegmentKey(value, hitStart) {
    const text = String(value || "");
    const range = segmentRanges(text).find(({ start, end }) => hitStart >= start && hitStart < end);
    if (!range) return null;
    const chunk = text.slice(range.start, range.end);
    const label = chunk.match(/^\s*([^：:·；;]{2,12})[：:]/);
    return label ? label[1].trim() : chunk.slice(0, 12).trim();
  }

  global.PharmacoPracticeSegments = Object.freeze({
    VERSION: 1,
    segmentRanges,
    splitSegments,
    deriveSegmentKey,
  });
})(globalThis);
