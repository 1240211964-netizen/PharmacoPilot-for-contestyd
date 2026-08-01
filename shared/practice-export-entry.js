import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import JSZip from "jszip";

const ENVIRONMENTS = Object.freeze([
  ["env01", "01 学习者与教学情境分析"],
  ["env02", "02 预期学习结果与评价证据设计"],
  ["env03", "03 教学内容结构化与前概念诊断"],
  ["env04", "04 真实性学习情境与资源设计"],
  ["env05", "05 学习活动与教学支架设计"],
  ["env06", "06 形成性评价与适应性调控"],
  ["env07", "07 表现性评价与学习成效诊断"],
  ["env08", "08 反思性实践与教学改进"],
  ["env09", "09 教学知识建构与专业共享"],
]);

function cssToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function docxColor(name) {
  return cssToken(name).replace(/^#/, "").toUpperCase();
}

function exportPalette() {
  return {
    accent: docxColor("--amber-deep"),
    ink: docxColor("--ink"),
    body: docxColor("--ink-2"),
    sage: docxColor("--sage"),
    rule: docxColor("--paper-3"),
    mute: docxColor("--mute-2"),
  };
}

function clean(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function safeStem(value) {
  return clean(value)
    .replace(/[《》]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72) || "课堂实践包";
}

function metadataLines(context, metadata) {
  return [
    ["课程", context.courseTitle],
    ["班级", `${context.classTitle || ""}${context.studentCount ? ` · ${context.studentCount} 人` : ""}`],
    ["课时", `${context.sessionTitle || ""}${context.durationMinutes ? ` · ${context.durationMinutes} 分钟` : ""}`],
    ["章节", context.chapterTitle],
    ["主题", context.topic],
    ["生成模型", metadata?.model || "本地 Qwen"],
    ["生成时间", metadata?.generatedAt ? new Date(metadata.generatedAt).toLocaleString("zh-CN", { hour12: false }) : ""],
  ].filter(([, value]) => clean(value));
}

function filenameStem(payload) {
  return safeStem(`PharmacoPilot-${payload.context.courseTitle}-${payload.context.chapterTitle}-课堂实践包`);
}

function buildMarkdown(payload) {
  const { context, metadata, pack } = payload;
  const lines = [
    "# PharmacoPilot 课堂实践包",
    "",
    ...metadataLines(context, metadata).flatMap(([label, value]) => [`- **${label}**：${clean(value)}`]),
    "",
    "> 本文件由教师确认的课堂教学设计摘要与本地模型生成结果合成。政策、法规、案例与数据来源仍需教师在使用前核验。",
    "",
  ];
  ENVIRONMENTS.forEach(([key, title]) => {
    lines.push(`## ${title}`, "", clean(pack[key]), "");
  });
  lines.push("---", "", "生成工具：PharmacoPilot · 本地优先课堂实践工作台", "");
  return lines.join("\n");
}

function contentParagraphs(value, palette) {
  const chunks = clean(value).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return chunks.flatMap((line) => {
    const colon = line.match(/^([^：:]{2,12})[：:]\s*(.+)$/);
    if (!colon) return [new Paragraph({ text: line, spacing: { after: 120, line: 330 } })];
    return [new Paragraph({
      spacing: { after: 120, line: 330 },
      children: [new TextRun({ text: `${colon[1]}：`, bold: true, color: palette.accent }), new TextRun(colon[2])],
    })];
  });
}

async function buildDocxBlob(payload) {
  const palette = exportPalette();
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
      children: [new TextRun({ text: "PharmacoPilot 课堂实践包", bold: true, color: palette.ink })],
    }),
    new Paragraph({
      spacing: { after: 280 },
      children: [new TextRun({ text: clean(payload.context.topic), color: palette.accent, size: 26 })],
    }),
    ...metadataLines(payload.context, payload.metadata).map(([label, value]) => new Paragraph({
      spacing: { after: 70 },
      children: [new TextRun({ text: `${label}　`, bold: true, color: palette.sage }), new TextRun(clean(value))],
    })),
    new Paragraph({
      spacing: { before: 220, after: 280 },
      border: { top: { color: palette.rule, size: 6, style: "single" } },
      children: [new TextRun({ text: "使用提示：政策、法规、案例与数据来源仍需教师在使用前核验。", italics: true, color: palette.mute })],
    }),
  ];

  ENVIRONMENTS.forEach(([key, title]) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: key !== "env01",
      spacing: { before: 240, after: 160 },
      children: [new TextRun({ text: title, bold: true, color: palette.accent })],
    }));
    children.push(...contentParagraphs(payload.pack[key], palette));
  });

  const doc = new Document({
    creator: "PharmacoPilot",
    title: `${payload.context.chapterTitle || ""} 课堂实践包`,
    description: "九个教学环节课堂实践包",
    styles: {
      default: {
        document: { run: { font: "Microsoft YaHei", size: 22, color: palette.body }, paragraph: { spacing: { line: 330 } } },
        title: { run: { font: "STSong", size: 40, bold: true }, paragraph: { spacing: { after: 120 } } },
        heading1: { run: { font: "STSong", size: 28, bold: true }, paragraph: { spacing: { before: 240, after: 160 } } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("PharmacoPilot · "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

function buildPrintableElement(payload) {
  const root = document.createElement("article");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:fixed;left:0;top:0;z-index:-2147483647;width:760px;background:var(--ivory);color:var(--ink);padding:54px 58px;font-family:'Songti SC','STSong',serif;font-size:16px;line-height:1.75;pointer-events:none;";
  const metadata = metadataLines(payload.context, payload.metadata)
    .map(([label, value]) => `<span style="margin-right:18px"><b>${label}</b>　${escapeHtml(value)}</span>`).join("");
  const sections = ENVIRONMENTS.map(([key, title]) => `
    <section style="break-inside:avoid;margin-top:28px;padding-top:18px;border-top:1px solid var(--paper-3)">
      <h2 style="margin:0 0 12px;color:var(--amber-deep);font-size:22px">${escapeHtml(title)}</h2>
      ${clean(payload.pack[key]).split(/\n+/).filter(Boolean).map((line) => `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`).join("")}
    </section>`).join("");
  root.innerHTML = `
    <header style="padding-bottom:22px;border-bottom:2px solid var(--ink)">
      <div style="font-family:ui-monospace,monospace;color:var(--amber-deep);letter-spacing:.12em;font-size:12px">PHARMACOPILOT · CLASSROOM PRACTICE PACK</div>
      <h1 style="margin:10px 0 4px;font-size:34px;line-height:1.25">课堂实践包</h1>
      <p style="margin:0;color:var(--mute);font-size:18px">${escapeHtml(payload.context.topic)}</p>
      <div style="margin-top:18px;color:var(--mute);font-size:12px;line-height:2">${metadata}</div>
    </header>
    <p style="margin:20px 0;padding:12px 14px;background:var(--paper-2);color:var(--mute-2);font-size:13px">政策、法规、案例与数据来源仍需教师在使用前核验。</p>
    ${sections}`;
  document.body.appendChild(root);
  return root;
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function buildPdfBlob(payload) {
  const root = buildPrintableElement(payload);
  try {
    await document.fonts?.ready;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = { top: 34, right: 34, bottom: 42, left: 34 };
    const contentWidth = pageWidth - margin.left - margin.right;
    const contentBottom = pageHeight - margin.bottom;
    const background = cssToken("--ivory");
    const blocks = [root.querySelector("header"), ...root.querySelectorAll(":scope > p, :scope > section")].filter(Boolean);
    let cursorY = margin.top;

    const paintPage = () => {
      pdf.setFillColor(background);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
    };
    const nextPage = () => {
      pdf.addPage();
      paintPage();
      cursorY = margin.top;
    };
    paintPage();

    for (const block of blocks) {
      const canvas = await html2canvas(block, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: background,
        logging: false,
        windowWidth: 876,
      });
      const renderedHeight = canvas.height * contentWidth / canvas.width;
      if (cursorY > margin.top && cursorY + renderedHeight > contentBottom) nextPage();

      if (renderedHeight <= contentBottom - margin.top) {
        pdf.addImage(canvas, "JPEG", margin.left, cursorY, contentWidth, renderedHeight, undefined, "FAST");
        cursorY += renderedHeight + 8;
        continue;
      }

      const sourcePageHeight = Math.floor(canvas.width * (contentBottom - margin.top) / contentWidth);
      for (let sourceY = 0; sourceY < canvas.height; sourceY += sourcePageHeight) {
        if (sourceY > 0 || cursorY > margin.top) nextPage();
        const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        slice.getContext("2d").drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const sliceRenderedHeight = sliceHeight * contentWidth / slice.width;
        pdf.addImage(slice, "JPEG", margin.left, margin.top, contentWidth, sliceRenderedHeight, undefined, "FAST");
        cursorY = margin.top + sliceRenderedHeight + 8;
      }
    }

    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(cssToken("--mute-2"));
      pdf.text(`PharmacoPilot · ${page} / ${totalPages}`, pageWidth - margin.right, pageHeight - 18, { align: "right" });
    }
    return pdf.output("blob");
  } finally {
    root.remove();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportFormat(format, payload, onStatus = () => {}) {
  const stem = filenameStem(payload);
  if (format === "md") {
    downloadBlob(new Blob([buildMarkdown(payload)], { type: "text/markdown;charset=utf-8" }), `${stem}.md`);
    return `${stem}.md`;
  }
  if (format === "docx") {
    onStatus("正在排版 Word…");
    downloadBlob(await buildDocxBlob(payload), `${stem}.docx`);
    return `${stem}.docx`;
  }
  if (format === "pdf") {
    onStatus("正在排版 PDF…");
    downloadBlob(await buildPdfBlob(payload), `${stem}.pdf`);
    return `${stem}.pdf`;
  }
  if (format === "zip") {
    onStatus("正在打包四种格式…");
    const [docxBlob, pdfBlob] = await Promise.all([buildDocxBlob(payload), buildPdfBlob(payload)]);
    const zip = new JSZip();
    zip.file(`${stem}.md`, buildMarkdown(payload));
    zip.file(`${stem}.docx`, docxBlob);
    zip.file(`${stem}.pdf`, pdfBlob);
    zip.file(`${stem}.json`, JSON.stringify({ ...payload, exportedAt: new Date().toISOString() }, null, 2));
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }), `${stem}.zip`);
    return `${stem}.zip`;
  }
  throw new Error(`不支持的导出格式：${format}`);
}

globalThis.PharmacoPracticeExport = Object.freeze({
  buildMarkdown,
  buildDocxBlob,
  buildPdfBlob,
  exportFormat,
});
