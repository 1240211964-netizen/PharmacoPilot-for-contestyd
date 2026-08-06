// 前测 CSV 导入解析(S1 教师自助导入通道)。
// 纪律:
//   - 服务端自写解析,零依赖;支持引号转义("")、字段内逗号/换行、CRLF/LF、BOM;
//   - 公式注入防护:任何以 = + - @ 开头的单元格在入库前统一加 ' 前缀
//     (教师把数据再导出到表格软件时不会被当作公式执行);
//   - 匿名纪律:student_anon_id 仅做格式校验 ^[A-Za-z0-9_-]{2,64}$;真实姓名/学号
//     由模板与文档约束教师不要填写,服务端不做启发式猜测(避免误杀合法匿名 ID);
//   - 行级错误聚合:{row, field, message}[],一次返回全部错误;
//     本模块只校验不写入,调用方保证"有错即零写入"。
import { failCode } from './errors.mjs';
import { nowIso } from './ids.mjs';

// items CSV:必需列 + 可选列 optionTexts(格式 A:文本|B:文本)。
export const ITEMS_REQUIRED_COLUMNS = ['item_no', 'stem', 'options', 'correct_option', 'knowledge_tags'];
const ITEMS_OPTIONAL_COLUMNS = ['optionTexts'];
// responses CSV:必需列 + 可选列 knowledge_level / experience_profile。
export const RESPONSES_REQUIRED_COLUMNS = ['student_anon_id', 'item_no', 'selected_option', 'participated'];
const RESPONSES_OPTIONAL_COLUMNS = ['knowledge_level', 'experience_profile'];

export const ANON_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;
const FORMULA_PREFIX = /^[=+\-@]/;
const MAX_OPTIONS = 8;

export const PRETEST_ITEMS_TEMPLATE = [
  'item_no,stem,options,correct_option,knowledge_tags,optionTexts',
  '1,关于口服制剂生物利用度的影响因素下列哪项描述正确?,A|B|C|D,B,药代动力学;生物利用度,A:食物对所有药物的生物利用度均无影响|B:首过效应可降低口服药物的生物利用度|C:生物利用度与给药途径无关|D:溶出度不影响生物利用度',
  '2,按《处方管理办法》急诊处方一般不得超过几日用量?,A|B|C|D,C,药事管理;处方管理,A:1 日|B:2 日|C:3 日|D:7 日',
  '',
].join('\n');

export const PRETEST_RESPONSES_TEMPLATE = [
  'student_anon_id,item_no,selected_option,participated,knowledge_level,experience_profile',
  'stu_01,1,B,1,基础,无实习经验',
  'stu_01,2,C,1,基础,无实习经验',
  'stu_02,1,A,1,中等,药房实习',
  'stu_02,2,,0,中等,药房实习',
  '',
].join('\n');

// 公式注入转义:= + - @ 开头的单元格加 ' 前缀。
function escapeFormula(cell) {
  return FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
}

// 健壮 CSV 解析:返回 { rows: [{ line, cells }], errors }。
// line 为记录序号(表头 = 1,首行数据 = 2);未闭合引号记为行级错误并尽力返回已解析行。
export function parseCsv(text) {
  const errors = [];
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  const pushField = () => {
    row.push(escapeFormula(field));
    field = '';
  };
  const pushRow = () => {
    pushField();
    // 跳过完全空白的行(空行不入结果,也不报错)。
    if (row.some((cell) => cell.trim() !== '')) rows.push({ line, cells: row });
    row = [];
  };
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
      continue;
    }
    if (ch === ',') {
      pushField();
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      line += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      line += 1;
      continue;
    }
    field += ch;
  }
  if (inQuotes) errors.push({ row: line, field: null, message: '存在未闭合的引号,该文件无法完整解析' });
  if (field !== '' || row.length > 0) pushRow();
  return { rows, errors };
}

// 表头 → 列名索引;缺必需列/未知列均记错误。返回 null 表示表头不可用。
function headerIndex(rows, required, optional, label, errors) {
  if (rows.length === 0) {
    errors.push({ row: 1, field: null, message: `${label} CSV 为空,至少需要表头行` });
    return null;
  }
  const header = rows[0];
  const known = new Set([...required, ...optional]);
  const index = new Map();
  for (const [col, raw] of header.cells.entries()) {
    const name = raw.trim();
    if (!known.has(name)) {
      errors.push({ row: header.line, field: name || `第${col + 1}列`, message: `${label} 表头含未知列 "${name}"` });
      continue;
    }
    if (index.has(name)) {
      errors.push({ row: header.line, field: name, message: `${label} 表头列 "${name}" 重复` });
      continue;
    }
    index.set(name, col);
  }
  for (const name of required) {
    if (!index.has(name)) errors.push({ row: header.line, field: name, message: `${label} 表头缺少必需列 ${name}` });
  }
  return errors.some((e) => e.row === header.line) ? null : index;
}

function cellOf(cells, index, name) {
  const col = index.get(name);
  return col === undefined ? '' : (cells[col] ?? '').trim();
}

// items CSV → Map(itemNo → fixture item)。错误全部聚合到 errors,不中断解析。
export function itemsFromCsv(text) {
  const errors = [];
  const { rows, errors: parseErrors } = parseCsv(text);
  errors.push(...parseErrors);
  const index = headerIndex(rows, ITEMS_REQUIRED_COLUMNS, ITEMS_OPTIONAL_COLUMNS, 'items', errors);
  const itemsByNo = new Map();
  if (!index) return { itemsByNo, errors };
  for (const { line, cells } of rows.slice(1)) {
    if (cells.length !== rows[0].cells.length) {
      errors.push({ row: line, field: null, message: `列数(${cells.length})与表头(${rows[0].cells.length})不一致` });
      continue;
    }
    const rawNo = cellOf(cells, index, 'item_no');
    let itemNo = null;
    if (!/^\d+$/.test(rawNo) || Number(rawNo) <= 0) {
      errors.push({ row: line, field: 'item_no', message: `item_no 必须是正整数,实际为 "${rawNo}"` });
    } else {
      itemNo = Number(rawNo);
      if (itemsByNo.has(itemNo)) {
        errors.push({ row: line, field: 'item_no', message: `item_no ${itemNo} 重复` });
        itemNo = null;
      }
    }
    const stem = cellOf(cells, index, 'stem');
    if (!stem) errors.push({ row: line, field: 'stem', message: 'stem 不能为空' });
    const optionKeys = cellOf(cells, index, 'options')
      .split('|')
      .map((k) => k.trim());
    if (
      optionKeys.length < 2 ||
      optionKeys.length > MAX_OPTIONS ||
      new Set(optionKeys).size !== optionKeys.length ||
      optionKeys.some((k) => !/^[A-Z]$/.test(k))
    ) {
      errors.push({
        row: line,
        field: 'options',
        message: `options 必须是 2-${MAX_OPTIONS} 个不重复的大写字母,用 | 分隔(如 A|B|C|D),实际为 "${cellOf(cells, index, 'options')}"`,
      });
    }
    const correctOption = cellOf(cells, index, 'correct_option');
    if (!optionKeys.includes(correctOption)) {
      errors.push({ row: line, field: 'correct_option', message: `correct_option "${correctOption}" 不在 options 内` });
    }
    const knowledgeTags = cellOf(cells, index, 'knowledge_tags')
      .split(';')
      .map((t) => t.trim())
      .filter((t) => t !== '');
    const textByKey = new Map();
    const rawTexts = cellOf(cells, index, 'optionTexts');
    if (rawTexts) {
      for (const entry of rawTexts.split('|')) {
        const sepAt = entry.indexOf(':');
        const key = (sepAt === -1 ? entry : entry.slice(0, sepAt)).trim();
        const text2 = sepAt === -1 ? '' : entry.slice(sepAt + 1).trim();
        if (!optionKeys.includes(key)) {
          errors.push({ row: line, field: 'optionTexts', message: `optionTexts 中的 "${key}" 不在 options 内` });
          continue;
        }
        textByKey.set(key, text2 || key);
      }
    }
    if (itemNo === null || !stem) continue;
    itemsByNo.set(itemNo, {
      itemNo,
      stem,
      options: optionKeys.map((key) => ({ key, text: textByKey.get(key) ?? key })),
      correctOption,
      knowledgeTags,
    });
  }
  if (itemsByNo.size === 0 && errors.length === 0) {
    errors.push({ row: 1, field: null, message: 'items CSV 没有任何数据行' });
  }
  return { itemsByNo, errors };
}

// responses CSV → { responses, students }。itemsByNo 用于校验 item/选项引用。
export function responsesFromCsv(text, itemsByNo) {
  const errors = [];
  const { rows, errors: parseErrors } = parseCsv(text);
  errors.push(...parseErrors);
  const index = headerIndex(rows, RESPONSES_REQUIRED_COLUMNS, RESPONSES_OPTIONAL_COLUMNS, 'responses', errors);
  const responses = [];
  const students = [];
  if (!index) return { responses, students, errors };
  const studentByAnon = new Map();
  const seen = new Set();
  for (const { line, cells } of rows.slice(1)) {
    if (cells.length !== rows[0].cells.length) {
      errors.push({ row: line, field: null, message: `列数(${cells.length})与表头(${rows[0].cells.length})不一致` });
      continue;
    }
    const anonId = cellOf(cells, index, 'student_anon_id');
    if (!ANON_ID_PATTERN.test(anonId)) {
      errors.push({
        row: line,
        field: 'student_anon_id',
        message: `student_anon_id "${anonId}" 不合法:仅允许字母/数字/_/-,长度 2-64(匿名纪律:不要填真实姓名或学号)`,
      });
    }
    const rawNo = cellOf(cells, index, 'item_no');
    const item = /^\d+$/.test(rawNo) ? itemsByNo.get(Number(rawNo)) : undefined;
    if (!/^\d+$/.test(rawNo)) {
      errors.push({ row: line, field: 'item_no', message: `item_no 必须是正整数,实际为 "${rawNo}"` });
    } else if (!item) {
      errors.push({ row: line, field: 'item_no', message: `item_no ${rawNo} 在 items CSV 中不存在` });
    }
    const rawParticipated = cellOf(cells, index, 'participated');
    let participated = null;
    if (rawParticipated !== '0' && rawParticipated !== '1') {
      errors.push({ row: line, field: 'participated', message: `participated 必须是 0 或 1,实际为 "${rawParticipated}"` });
    } else {
      participated = Number(rawParticipated);
    }
    const selectedRaw = cellOf(cells, index, 'selected_option');
    let selectedOption = selectedRaw === '' ? null : selectedRaw;
    if (item) {
      if (selectedOption !== null && !item.options.some((o) => o.key === selectedOption)) {
        errors.push({
          row: line,
          field: 'selected_option',
          message: `selected_option "${selectedOption}" 不在题目 ${item.itemNo} 的选项内`,
        });
      }
      if (participated === 1 && selectedOption === null) {
        errors.push({ row: line, field: 'selected_option', message: 'participated=1 时 selected_option 不能为空' });
      }
    }
    if (anonId && item) {
      const key = `${anonId}#${item.itemNo}`;
      if (seen.has(key)) {
        errors.push({ row: line, field: null, message: `学生 ${anonId} 对题目 ${item.itemNo} 重复作答` });
      }
      seen.add(key);
    }
    if (!ANON_ID_PATTERN.test(anonId) || !item || participated === null) continue;
    const knowledgeLevel = cellOf(cells, index, 'knowledge_level') || null;
    const experienceProfile = cellOf(cells, index, 'experience_profile') || null;
    if (!studentByAnon.has(anonId)) {
      const student = { anonId, knowledgeLevel, experienceProfile };
      studentByAnon.set(anonId, student);
      students.push(student);
    } else {
      const student = studentByAnon.get(anonId);
      if (student.knowledgeLevel == null && knowledgeLevel != null) student.knowledgeLevel = knowledgeLevel;
      if (student.experienceProfile == null && experienceProfile != null) student.experienceProfile = experienceProfile;
    }
    responses.push({ studentAnonId: anonId, itemNo: item.itemNo, selectedOption, participated });
  }
  if (responses.length === 0 && errors.length === 0) {
    errors.push({ row: 1, field: null, message: 'responses CSV 没有任何数据行' });
  }
  return { responses, students, errors };
}

// 两份 CSV → importPretest 可用的 fixture。任何行级错误都使整体失败(零写入由调用方的事务保证)。
export function fixtureFromCsv({ itemsCsv, responsesCsv }) {
  const { itemsByNo, errors: itemErrors } = itemsFromCsv(itemsCsv);
  const { responses, students, errors: responseErrors } = responsesFromCsv(responsesCsv, itemsByNo);
  const errors = [...itemErrors, ...responseErrors].sort((a, b) => a.row - b.row);
  if (errors.length > 0) {
    failCode('PRETEST_CSV_INVALID', `前测 CSV 校验失败,共 ${errors.length} 处错误(未写入任何数据)`, { errors });
  }
  const submittedAt = nowIso();
  return {
    schemaVersion: '1.0.0',
    items: [...itemsByNo.values()].sort((a, b) => a.itemNo - b.itemNo),
    students,
    responses: responses.map((r) => ({ ...r, submittedAt })),
  };
}
