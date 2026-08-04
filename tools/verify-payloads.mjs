import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 造 window 壳(照抄 verify-data-detail.mjs 的 vm 模式);
// 契约/payload/决策库全是经典 IIFE `(function(g){…})(window)`,只写 window 不读 DOM。
function loadShared() {
  const storage = new Map();
  const context = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    window: {
      dispatchEvent() {},
      addEventListener() {},
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
  };
  context.window.localStorage = context.localStorage;
  const files = [
    'shared/nav-stations-contract.js',
    ...Array.from({ length: 11 }, (_, i) => `shared/station${i + 1}.payload.js`),
    'shared/nav-decision-bank.js',
  ];
  for (const rel of files) {
    vm.runInNewContext(read(rel), context, { filename: rel });
  }
  return context.window;
}

// station11 的 parentStageId/subNodeKey 是数组(["S8","S9"]/["11a","11b"]),统一成数组遍历
function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

try {
  const win = loadShared();
  const contract = win.PharmacoPilotNavigationContract;
  const payloads = win.PharmacoPilotStationPayloads;
  const bank = win.PharmacoPilotDecisionBank;
  assert(contract, 'window.PharmacoPilotNavigationContract 未注册');
  assert(payloads, 'window.PharmacoPilotStationPayloads 未注册');
  assert(bank, 'window.PharmacoPilotDecisionBank 未注册');

  const ids = Array.from({ length: 11 }, (_, i) => i + 1);
  const stageIds = new Set(contract.NAV_STAGES.map((s) => s.id));
  const subNodeKeys = new Set(Object.keys(contract.SUB_NODES));
  const visibleSubNodeKeys = contract.NAV_STAGES.flatMap((stage) => stage.subNodeIds.map(String));

  // (a) 恰好注册 station 1-11
  const registered = Object.keys(payloads).map(Number).sort((x, y) => x - y);
  assert(
    registered.length === 11 && ids.every((id, i) => registered[i] === id),
    `PharmacoPilotStationPayloads 必须恰好注册 1-11,实际: [${registered.join(', ')}]`
  );

  for (const id of ids) {
    const p = payloads[id];
    // (b) 必备键
    for (const key of ['id', 'version', 'narrative', 'decision', 'evidenceFigure', 'artifacts', 'chainTopcard']) {
      assert(p[key] != null, `station${id}.payload 缺少必备键 "${key}"`);
    }
    assert(p.id === id, `station${id}.payload 的 id 应为 ${id},实际 ${p.id}`);
    // (c) parentStageId → NAV_STAGES;subNodeKey(若有)→ SUB_NODES
    for (const stageId of asArray(p.parentStageId)) {
      assert(stageIds.has(stageId), `station${id}.payload 的 parentStageId "${stageId}" 不在 NAV_STAGES`);
    }
    if (p.subNodeKey != null) {
      for (const subKey of asArray(p.subNodeKey)) {
        assert(subNodeKeys.has(String(subKey)), `station${id}.payload 的 subNodeKey "${subKey}" 不在 SUB_NODES`);
      }
    }
    // (f) 决策库每站非空选项数组
    assert(
      Array.isArray(bank[id]) && bank[id].length > 0,
      `PharmacoPilotDecisionBank 对 station ${id} 缺少非空选项数组`
    );
  }

  // (d) 契约每个 stage 的 subNodeIds 都能在 SUB_NODES 反查到(数字键统一转字符串)
  for (const stage of contract.NAV_STAGES) {
    for (const subId of stage.subNodeIds) {
      assert(subNodeKeys.has(String(subId)), `NAV_STAGES ${stage.id} 的 subNodeId "${subId}" 在 SUB_NODES 反查不到`);
    }
  }

  // (d2) 前台当前可见的每个子步骤都必须有独立 SWOT 操作说明。
  // 主视图只读 good/how；why 保留为默认折叠的设计依据。
  assert(contract.SWOT_NODE_GUIDES, 'SWOT_NODE_GUIDES 未导出');
  assert(
    Object.keys(contract.SWOT_NODE_GUIDES).length === visibleSubNodeKeys.length,
    `SWOT_NODE_GUIDES 应覆盖 ${visibleSubNodeKeys.length} 个可见子步骤`
  );
  for (const subKey of visibleSubNodeKeys) {
    const guide = contract.SWOT_NODE_GUIDES[subKey];
    assert(guide, `可见子步骤 ${subKey} 缺少 SWOT_NODE_GUIDES`);
    for (const key of ['good', 'how', 'why']) {
      assert(typeof guide[key] === 'string' && guide[key].length >= 20, `子步骤 ${subKey}.${key} 过短或缺失`);
    }
    const joined = `${guide.good} ${guide.how}`;
    assert(
      /SWOT|TOWS|华海药业|集采/.test(joined),
      `子步骤 ${subKey} 说明未落到当前 SWOT 贯穿案例`
    );
  }

  const navRender = read('shared/nav-render.js');
  const navHtml = read('nav-detail.html');
  assert(
    /C\.SWOT_NODE_GUIDES\?\.\[String\(subKey\)\]/.test(navRender) &&
      /function stationGuide\(s\)/.test(navRender) &&
      /做好是什么样/.test(navRender) &&
      /怎么做好/.test(navRender),
    '节点说明必须消费子步骤指南并优先呈现两个核心问题'
  );
  assert(
    /class="intro-rationale"/.test(navRender) &&
      /设计依据 · 为什么这样做/.test(navRender) &&
      /\.station-intro\s*\{[^}]*repeat\(2,/s.test(navHtml) &&
      /nav-detail\.bundle\.js\?v=25-feedback-structure/.test(navHtml),
    '为什么应降级为折叠设计依据，两张主卡应保持两列并刷新缓存版本'
  );
  assert(
    /const PHASE_COLORS\s*=/.test(navRender) &&
      !/ICAP_COLORS/.test(navRender) &&
      /课堂阶段 →/.test(navRender) &&
      /讲授 · 分析 · 协作与质询 · 反馈/.test(navRender) &&
      !/(?:tl-icap|icap-lbl|icap-bar|icap-key)/.test(navRender + navHtml),
    '时间轴色带只能表示课堂阶段，不得使用 ICAP 命名或声称按参与层级取色'
  );
  assert(
    /const guide = stationGuide\(s\);[\s\S]*## 做好是什么样[\s\S]*esc\(guide\.good\)[\s\S]*## 怎么做好[\s\S]*esc\(guide\.how\)/.test(navRender),
    '待生成产物模板也必须与主视图共用同一份 SWOT 子步骤指南'
  );
  assert(
    /function renderStationIntro\(s\)\s*\{[\s\S]*if \(_suppressDetailHead\) return "";/.test(navRender),
    '合并子步骤 2-3 的追加段不得重复渲染同一组节点说明'
  );

  // Biggs 对齐闭环：S5 的每个角色活动段必须指向 S2 已公布且 S7 已评分的 metricId。
  // 只验证已有映射的结构闭合，不在门禁中新增或改写教学目标。
  const roleSequence = payloads[8]?.evidenceFigure?.roleTimeBudget?.sequence;
  const s2MetricIds = new Set(
    payloads[4].evidenceFigure.goalEvidenceMap.flatMap((item) => item.metrics.map((metric) => metric.metricId))
  );
  const s7MetricIds = new Set(payloads[10].evidenceFigure.rubric.map((item) => item.metricId));
  assert(Array.isArray(roleSequence) && roleSequence.length === 4, 'station8 必须保留 4 个角色活动段');
  for (const segment of roleSequence) {
    assert(
      Array.isArray(segment.servesGoals) && segment.servesGoals.length > 0,
      `station8 ${segment.primaryRole} ${segment.t}′–${segment.end}′ 缺少 servesGoals`
    );
    for (const metricId of segment.servesGoals) {
      assert(s2MetricIds.has(metricId), `station8 servesGoals "${metricId}" 未在 S2 目标—证据映射中定义`);
      assert(s7MetricIds.has(metricId), `station8 servesGoals "${metricId}" 未在 S7 评价标准中取证`);
    }
  }
  assert(
    !roleSequence.some((segment) => segment.servesGoals.includes('s7_artifact_critical_reflection')),
    '批判反思由 39′–42′ 反馈段承担，不得偷塞进 13 分钟角色协作段'
  );

  // Hattie & Timperley 反馈框架：不把整条反馈降维成单一 level 标签。
  // 项目操作化为三个必填组成部分，self 层单独作为禁止项。
  const s7Figure = payloads[10]?.evidenceFigure;
  const feedbackArchitecture = s7Figure?.feedbackArchitecture;
  const requiredFeedbackFields = ['task', 'process', 'selfRegulation'];
  assert(feedbackArchitecture, 'station10 缺少 feedbackArchitecture');
  assert(
    JSON.stringify(feedbackArchitecture.requiredFields) === JSON.stringify(requiredFeedbackFields),
    'station10 反馈结构必须同时要求 task / process / selfRegulation'
  );
  assert(
    feedbackArchitecture.excludedFocus?.key === 'self' && feedbackArchitecture.excludedFocus?.rule,
    'station10 必须显式禁止用 self 层的笼统人格评价代替学习信息'
  );
  const feedbackTemplates = [
    ...s7Figure.rubric.map((item) => item.feedbackTemplate),
    ...s7Figure.feedbackOnlyIndicators.map((item) => item.feedbackTemplate),
  ];
  for (const [index, template] of feedbackTemplates.entries()) {
    for (const field of requiredFeedbackFields) {
      assert(
        typeof template?.[field] === 'string' && template[field].trim().length >= 20,
        `station10 反馈模板 ${index + 1} 缺少可执行的 ${field} 内容`
      );
    }
    assert(!Object.hasOwn(template, 'feedbackLevel'), 'station10 反馈模板不得使用单值 feedbackLevel');
  }
  assert(
    !/feedbackLevel/.test(JSON.stringify(payloads[10])),
    'station10 不得把整条反馈归入单一 feedbackLevel'
  );
  assert(
    !/Hattie\s*反馈层级/.test(navRender) && /当前任务差距/.test(navRender) && /如何自检/.test(navRender),
    '前台应说明反馈的三个组成部分，不展示单值层级分类'
  );

  // (e) STAGE_CHAIN 的 inputsFrom/outputsTo 引用的 stage id 均存在
  for (const [stageId, chain] of Object.entries(contract.STAGE_CHAIN)) {
    assert(stageIds.has(stageId), `STAGE_CHAIN 键 "${stageId}" 不在 NAV_STAGES`);
    for (const ref of [...chain.inputsFrom, ...chain.outputsTo]) {
      assert(stageIds.has(ref), `STAGE_CHAIN ${stageId} 引用的 stage "${ref}" 不存在`);
    }
  }

  // (f) 前台 theory-chip 的三条契约（2026-08-03 新划界，见 NAV_STAGES 硬约束）
  //     原契约禁止前台出现理论标签，但前台实际常驻 27 条、恰含被点名的
  //     ZPD / UbD / Bloom。改为「课程级可展示，但每条须指得出机制、且同名同署名」，
  //     并在此机器校验，防止再次漂回装饰性堆砌。
  const chipPages = ['index.html', 'nav-detail.html', 'data-detail.html'];
  const chipRe = /class="theory-chip">\s*([^<]+?)\s*<small>\s*([^<]+?)\s*<\/small>/g;
  const chipIndex = new Map();   // 名称 → 署名集合
  for (const page of chipPages) {
    const html = read(page);
    for (const m of html.matchAll(chipRe)) {
      const name = m[1].replace(/&amp;/g, '&').trim();
      const src = m[2].replace(/&amp;/g, '&').trim();
      if (!chipIndex.has(name)) chipIndex.set(name, new Set());
      chipIndex.get(name).add(src);
    }
  }

  // f-1 已撤除的零机制标签不得回流
  const RETIRED_CHIPS = ['ADDIE', 'OBE 成果导向', '教学事件九步', '5E 教学模型', 'TPACK', '课例研究'];
  for (const retired of RETIRED_CHIPS) {
    for (const name of chipIndex.keys()) {
      assert(
        !name.includes(retired),
        `theory-chip「${name}」已于 2026-08-03 因指不出机制而撤除，不得回流；` +
        '若要恢复，须先在系统中建立可指认的机制'
      );
    }
  }

  // f-2 同一理论不得同名不同署名
  for (const [name, srcs] of chipIndex) {
    assert(
      srcs.size === 1,
      `theory-chip「${name}」出现 ${srcs.size} 种署名（${[...srcs].join(' / ')}），须统一为原始文献`
    );
  }

  // f-3 同一理论不得换名重复出现（这三组曾各自重复）
  const ALIAS_CONFLICTS = [
    [['UbD', 'Backward Design'], 'UbD 与 Backward Design 是同一框架，前台只保留一种写法'],
    [['ICAP 学习参与', 'ICAP 参与层级'], 'ICAP 只保留一种命名；「参与层级」与已撤销的时间轴色带声称同名，不再使用'],
    [['CAPE 教育成果', '药学教育成果 CAPE'], 'CAPE 只保留一种标签写法'],
  ];
  for (const [aliases, msg] of ALIAS_CONFLICTS) {
    const present = aliases.filter((alias) => [...chipIndex.keys()].some((n) => n.includes(alias)));
    assert(present.length <= 1, `${msg}（当前同时存在：${present.join(' / ')}）`);
  }
} catch (err) {
  console.error(`verify-payloads: FAIL — ${err.message}`);
  process.exit(1);
}

console.log('verify-payloads: ok');
