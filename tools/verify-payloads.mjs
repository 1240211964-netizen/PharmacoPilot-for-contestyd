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

  // (e) STAGE_CHAIN 的 inputsFrom/outputsTo 引用的 stage id 均存在
  for (const [stageId, chain] of Object.entries(contract.STAGE_CHAIN)) {
    assert(stageIds.has(stageId), `STAGE_CHAIN 键 "${stageId}" 不在 NAV_STAGES`);
    for (const ref of [...chain.inputsFrom, ...chain.outputsTo]) {
      assert(stageIds.has(ref), `STAGE_CHAIN ${stageId} 引用的 stage "${ref}" 不存在`);
    }
  }
} catch (err) {
  console.error(`verify-payloads: FAIL — ${err.message}`);
  process.exit(1);
}

console.log('verify-payloads: ok');
