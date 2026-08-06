import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { PRACTICE_REVIEWERS } from "./agents.mjs";
import { createPharmacoServer } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";

test("PharmacoPilot backend contract", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-backend-test-"));
  const calls = [];
  const generatedPack = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`env${String(index + 1).padStart(2, "0")}`, `环节 ${index + 1} · 可观察产出`]),
  );
  const anchoredReview = {
    targetEnv: "env02",
    sourceExcerpt: "目标：比较集采替代中的质量与可及性权衡",
    issue: "目标要求比较权衡，但现有评价标准只记录结论，没有观察学生如何使用证据。",
    suggestion: "在评价标准中增加一项：能否引用两类证据解释取舍，并说明证据边界。",
    crossReferences: [{ envKey: "env05", sourceExcerpt: "任务：用两类证据完成替代决策并说明边界" }],
  };
  const pharmacyReview = {
    targetEnv: "env05",
    sourceExcerpt: "任务：用两类证据完成替代决策并说明边界",
    issue: "任务没有落到具体科室与患者群，学生无法体会真实替代决策的临床语境。",
    suggestion: "把任务背景设为心内科门诊的高血压长期处方患者，并指明由药事委员会作决策。",
    crossReferences: [],
  };
  const fakeModel = {
    async status() {
      return { ready: true, endpoint: "http://fake/v1", model: "fake-model", advertisedModels: ["fake-model"] };
    },
    async chat(request) {
      calls.push(request);
      if (request.stream) {
        return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
          headers: { "content-type": "text/event-stream; charset=utf-8" },
        });
      }
      if (request.messages[0]?.content.includes("课堂实践包生成器")) {
        if (request.messages[1]?.content.includes("RAW_MULTILINE_JSON")) {
          const rawMultiline = `{${Array.from({ length: 9 }, (_, index) => {
            const key = `env${String(index + 1).padStart(2, "0")}`;
            return `"${key}":"目标与产出：环节 ${index + 1}\n教师动作：执行任务 ${index + 1}"`;
          }).join(",")}}`;
          return new Response(JSON.stringify({
            id: "practice-pack-raw-multiline",
            model: "fake-model",
            choices: [{ message: { role: "assistant", content: rawMultiline } }],
          }), { headers: { "content-type": "application/json" } });
        }
        if (request.messages[1]?.content.includes("INVALID_OUTPUT_TOPIC")) {
          return new Response(JSON.stringify({
            id: "practice-pack-invalid",
            model: "fake-model",
            choices: [{ message: { role: "assistant", content: "这不是 JSON" } }],
          }), { headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({
          id: "practice-pack-test",
          model: "fake-model",
          choices: [{ message: { role: "assistant", content: JSON.stringify(generatedPack) } }],
        }), { headers: { "content-type": "application/json" } });
      }
      if (request.messages[0]?.content.startsWith("你是 PharmacoPilot 教学实践卷宗中的“药学情境审校”")) {
        return new Response(JSON.stringify({
          id: "practice-review-pharmacy-test",
          model: "fake-model",
          choices: [{ message: { role: "assistant", content: JSON.stringify(pharmacyReview) } }],
        }), { headers: { "content-type": "application/json" } });
      }
      if (request.messages[0]?.content.includes("教学设计审校")) {
        const wrongEnv = request.messages.some((message) => message.content.includes("REVIEW_WRONG_ENV"));
        const longIssue = request.messages.some((message) => message.content.includes("REVIEW_LONG_ISSUE"));
        const isCorrection = request.messages.some((message) => message.content.includes("机械门禁"));
        const annotation = wrongEnv
          ? {
              ...anchoredReview,
              targetEnv: "env04",
              sourceExcerpt: "证据：待核实集采政策来源与适用范围",
              crossReferences: [],
            }
          : longIssue && !isCorrection
            ? { ...anchoredReview, issue: "目标要求比较权衡，但现有评价标准只记录结论，没有观察学生如何使用证据，也没有区分结论正确但证据缺失与证据充分但结论保守这两种完全不同的学习状态。" }
            : anchoredReview;
        return new Response(JSON.stringify({
          id: "practice-review-test",
          model: "fake-model",
          choices: [{ message: { role: "assistant", content: JSON.stringify(annotation) } }],
        }), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        id: "chat-test",
        model: "fake-model",
        choices: [{ message: { role: "assistant", content: "已收到" } }],
      }), { headers: { "content-type": "application/json" } });
    },
  };
  const config = loadConfig({
    rootDir: resolve("."),
    dataDir: tempDir,
    host: "127.0.0.1",
    port: 0,
    modelBaseUrl: "http://127.0.0.1:8080/v1",
    modelName: "fake-model",
  });
  const database = new PharmacoDatabase(config.dataDir);
  const server = createPharmacoServer({ config, database, modelClient: fakeModel, logger: { error() {} } });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test("serves the existing frontend and health endpoint", async () => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    const pageHtml = await page.text();
    assert.match(pageHtml, /PharmacoPilot/);
    assert.match(pageHtml, /<body\s+data-backend-enabled="true"/);

    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.database, "ready");
    assert.equal(body.model.name, "fake-model");
  });

  await t.test("refuses to serve repo internals over the static route", async () => {
    // 后端与源码/依赖/状态库同处仓库根,且静态路由不过 API token —— 这些必须 403
    for (const path of [
      "/.git/config", "/.git/HEAD", "/.pharmaco-data/pharmaco.sqlite", "/.gitignore",
      "/server/app.mjs", "/server/db.mjs", "/node_modules/esbuild/package.json",
      "/SERVER/app.mjs", "/Node_Modules/esbuild/package.json",
      "/package.json", "/build.mjs", "/BACKEND.md", "/RELEASE_NOTES.md",
      "/TYPOGRAPHY.md", "/audit-baseline-2026-06-04.md", "/gsap-demo.html",
      "/nav-station-01-draft.html", "/shared/bc-header.notes.html",
      "/assets/.DS_Store", "/%E5%90%AF%E5%8A%A83D%E6%95%99%E5%AE%A4.command",
    ]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 403, `${path} 应被拒绝,实际 ${response.status}`);
    }
    // 正常站点资源不受影响
    assert.equal((await fetch(`${base}/shared/tokens.css`)).status, 200);
    assert.equal((await fetch(`${base}/shared/vendor/three/build/three.module.min.js`)).status, 200);
  });

  await t.test("serves the explicitly allowlisted CH06 review page only", async () => {
    const reviewPage = await fetch(`${base}/ch06-real-pilot.html`);
    assert.equal(reviewPage.status, 200);
    assert.match(await reviewPage.text(), /CH06 真实教学设计试点/);
    const nonAllowlistedPage = await fetch(`${base}/gsap-demo.html`);
    assert.equal(nonAllowlistedPage.status, 403);
  });

  await t.test("exposes public agent metadata without system prompts", async () => {
    const response = await fetch(`${base}/api/agents`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.agents.length, 5);
    assert.equal(body.agents.some((agent) => "systemPrompt" in agent), false);
  });

  await t.test("stores state with optimistic revision protection", async () => {
    const initialResponse = await fetch(`${base}/api/workspaces/default/state`);
    const initial = await initialResponse.json();
    assert.deepEqual(initial, {
      workspaceId: "default", revision: 0, state: null, hash: null, updatedAt: null,
    });
    assert.equal(initialResponse.headers.get("etag"), '"0"');

    const savedResponse = await fetch(`${base}/api/workspaces/default/state`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({ state: { version: "v1", activeStation: 5 } }),
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal(saved.revision, 1);
    assert.match(saved.hash, /^[a-f0-9]{64}$/);

    const conflictResponse = await fetch(`${base}/api/workspaces/default/state`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({ state: { version: "v1", activeStation: 9 } }),
    });
    assert.equal(conflictResponse.status, 409);
    const conflict = await conflictResponse.json();
    assert.equal(conflict.error.code, "REVISION_CONFLICT");
    assert.equal(conflict.current.revision, 1);
    assert.equal(conflict.current.state.activeStation, 5);
  });

  await t.test("injects the selected teaching agent prompt server-side", async () => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "evidence-verifier",
        messages: [{ role: "user", content: "请检查这条主张" }],
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.choices[0].message.content, "已收到");
    assert.equal(calls.at(-1).messages[0].role, "system");
    assert.match(calls.at(-1).messages[0].content, /证据校验师/);
    assert.equal(calls.at(-1).messages[1].content, "请检查这条主张");
  });

  await t.test("passes through streaming model responses", async () => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "teaching-reflector",
        stream: true,
        messages: [{ role: "user", content: "复盘" }],
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    assert.match(await response.text(), /\[DONE\]/);
  });

  await t.test("generates and validates a nine-stage practice pack", async () => {
    const currentPack = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`env${String(index + 1).padStart(2, "0")}`, `原环节 ${index + 1}`]),
    );
    const response = await fetch(`${base}/api/practice/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          chapterId: "ch5-procurement",
          courseTitle: "《药事管理学》本",
          courseLevel: "本科",
          classTitle: "2026 级药管 1 班",
          studentCount: 32,
          sessionTitle: "第 7 周 · 周三 3-4 节",
          durationMinutes: 45,
          chapterTitle: "第 5 章 · 集采制度",
          topic: "集采后仿制药替代",
        },
        currentPack,
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "local-model");
    assert.equal(body.chapterId, "ch5-procurement");
    assert.deepEqual(body.pack, generatedPack);

    const request = calls.at(-1);
    assert.equal(request.stream, false);
    assert.equal(request.maxTokens, 4_096);
    assert.match(request.messages[0].content, /不得虚构政策文号/);
    assert.match(request.messages[1].content, /集采后仿制药替代/);
    assert.match(request.messages[1].content, /2026 级药管 1 班/);
    assert.match(request.messages[1].content, /<design_briefs>/);
  });

  await t.test("regenerates one practice section without replacing the other eight", async () => {
    const currentPack = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`env${String(index + 1).padStart(2, "0")}`, `生成要求 ${index + 1}`]),
    );
    const response = await fetch(`${base}/api/practice/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          chapterId: "ch5-procurement",
          courseTitle: "《药事管理学》本科",
          courseLevel: "本科",
          classTitle: "2026 级药管 1 班",
          studentCount: 32,
          sessionTitle: "第 7 周 · 周三 3-4 节",
          durationMinutes: 45,
          chapterTitle: "第 5 章 · 集采制度",
          topic: "集采后仿制药替代",
        },
        designBriefs: currentPack,
        generatedPack,
        targetEnv: "env05",
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.targetEnv, "env05");
    assert.deepEqual(body.pack, { env05: generatedPack.env05 });
    assert.match(calls.at(-1).messages[1].content, /<requested_env>\s*env05\s*<\/requested_env>/);
  });

  await t.test("rejects an incomplete practice context before model inference", async () => {
    const callCount = calls.length;
    const response = await fetch(`${base}/api/practice/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: { chapterId: "missing-fields" }, currentPack: {} }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "INVALID_PRACTICE_CONTEXT");
    assert.equal(calls.length, callCount);
  });

  await t.test("repairs raw line breaks inside local-model JSON strings", async () => {
    const currentPack = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`env${String(index + 1).padStart(2, "0")}`, `生成要求 ${index + 1}`]),
    );
    const response = await fetch(`${base}/api/practice/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          chapterId: "raw-multiline",
          courseTitle: "《管理学原理》本科",
          courseLevel: "本科",
          classTitle: "2025 级药事管理 1 班",
          studentCount: 33,
          sessionTitle: "第 5 周",
          durationMinutes: 90,
          chapterTitle: "第 3 章 · 管理环境与战略分析",
          topic: "RAW_MULTILINE_JSON",
        },
        designBriefs: currentPack,
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.pack.env01, /目标与产出：环节 1\n教师动作：执行任务 1/);
  });

  await t.test("fails closed when the model output is not a complete JSON pack", async () => {
    const currentPack = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`env${String(index + 1).padStart(2, "0")}`, `原环节 ${index + 1}`]),
    );
    const response = await fetch(`${base}/api/practice/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          chapterId: "invalid-output",
          courseTitle: "测试课程",
          courseLevel: "本科",
          classTitle: "测试班",
          studentCount: 30,
          sessionTitle: "测试课时",
          durationMinutes: 45,
          chapterTitle: "测试章节",
          topic: "INVALID_OUTPUT_TOPIC",
        },
        currentPack,
      }),
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.error.code, "MODEL_OUTPUT_INVALID");
  });

  await t.test("anchors, canonicalizes and caches a single practice review", async () => {
    const currentPack = {
      env01: "诊断：匿名投票识别学生对集采替代的初始判断",
      env02: "目标：比较集采替代中的质量与可及性权衡 · 评价标准：能说明结论",
      env03: "误区：只比较药价而忽略疗效与患者可及性",
      env04: "证据：待核实集采政策来源与适用范围",
      env05: "任务：用两类证据完成替代决策并说明边界 · 输出：三方决策备忘录",
      env06: "调控：追问证据来源并记录沉默节点",
      env07: "评价：依据评价标准形成学习画像",
      env08: "复盘：比较初始判断与最终决策",
      env09: "沉淀：保存可复用的问题链与评价标准",
    };
    const requestBody = {
      reviewerId: "instructional-design",
      sourceRevision: 3,
      context: {
        chapterId: "ch5-procurement",
        courseTitle: "药事管理学",
        courseLevel: "本科",
        classTitle: "药管 1 班",
        studentCount: 32,
        sessionTitle: "第 7 周",
        durationMinutes: 45,
        chapterTitle: "集采制度",
        topic: "集采后仿制药替代",
      },
      currentPack,
    };
    const before = calls.length;
    const response = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "anchored");
    assert.equal(body.reviewer.expertId, "expert-edu");
    assert.equal(body.sourceRevision, 3);
    assert.equal(body.annotation.targetEnv, "env02");
    assert.equal(body.annotation.segmentKey, "目标");
    assert.equal(body.annotation.sourceExcerpt, anchoredReview.sourceExcerpt);
    assert.equal(body.annotation.crossReferences[0].sourceExcerpt, anchoredReview.crossReferences[0].sourceExcerpt);
    assert.match(body.manuscriptHash, /^[a-f0-9]{64}$/);
    assert.equal(body.cache.hit, false);
    assert.equal(calls.length, before + 1);
    assert.match(calls.at(-1).messages[0].content, /只在 env02/);

    const cachedResponse = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const cached = await cachedResponse.json();
    assert.equal(cached.status, "anchored");
    assert.equal(cached.cache.hit, true);
    assert.equal(calls.length, before + 1, "缓存命中不应再次调用模型");
  });

  await t.test("retries once and degrades when a review stays outside its discipline scope", async () => {
    const currentPack = {
      env01: "诊断：匿名投票识别学生的初始判断",
      env02: "目标：比较两种管理方案并说明证据边界",
      env03: "误区：把价格下降直接等同于治疗价值提升",
      env04: "证据：待核实集采政策来源与适用范围",
      env05: "任务：REVIEW_WRONG_ENV 条件下完成多方决策",
      env06: "调控：追问证据并记录沉默节点",
      env07: "评价：按评价标准形成可观察学习画像",
      env08: "复盘：比较初始判断与最终决策",
      env09: "沉淀：保存可复用的问题链与评价标准",
    };
    const before = calls.length;
    const response = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewerId: "instructional-design",
        sourceRevision: 4,
        context: {
          chapterId: "wrong-scope",
          courseTitle: "药事管理学",
          courseLevel: "本科",
          classTitle: "测试班",
          studentCount: 30,
          sessionTitle: "测试课时",
          durationMinutes: 45,
          chapterTitle: "测试章节",
          topic: "REVIEW_WRONG_ENV",
        },
        currentPack,
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "unanchored");
    assert.equal(body.gate.reason, "out_of_scope");
    assert.equal(body.unlocatedReview.issue, anchoredReview.issue);
    assert.equal(body.unlocatedReview.claimedTargetEnv, "env04");
    assert.equal(body.unlocatedReview.gateReason, "out_of_scope");
    assert.equal(body.unlocatedReview.sourceRevision, 4);
    assert.match(body.unlocatedReview.manuscriptHash, /^[a-f0-9]{64}$/);
    assert.equal(body.attempts, 2);
    assert.equal(body.cache.hit, false);
    assert.equal(calls.length, before + 2);
    assert.match(calls.at(-1).messages.at(-1).content, /机械门禁/);
  });

  await t.test("recovers through the correction loop when the first issue exceeds the concise limit", async () => {
    const currentPack = {
      env01: "诊断：匿名投票识别学生对集采替代的初始判断",
      env02: "目标：比较集采替代中的质量与可及性权衡 · 评价标准：能说明结论",
      env03: "误区：只比较药价而忽略疗效与患者可及性",
      env04: "证据：待核实集采政策来源与适用范围",
      env05: "任务：用两类证据完成替代决策并说明边界 · 输出：三方决策备忘录",
      env06: "调控：追问证据来源并记录沉默节点",
      env07: "评价：依据评价标准形成学习画像",
      env08: "复盘：比较初始判断与最终决策",
      env09: "沉淀：保存可复用的问题链与评价标准",
    };
    const before = calls.length;
    const response = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewerId: "instructional-design",
        sourceRevision: 6,
        context: {
          chapterId: "ch5-procurement",
          courseTitle: "药事管理学",
          courseLevel: "本科",
          classTitle: "药管 1 班",
          studentCount: 32,
          sessionTitle: "第 7 周",
          durationMinutes: 45,
          chapterTitle: "集采制度",
          topic: "REVIEW_LONG_ISSUE",
        },
        currentPack,
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "anchored");
    assert.equal(body.attempts, 2, "首轮超长应触发一次修正后锚定");
    assert.equal(body.annotation.issue, anchoredReview.issue);
    assert.equal(body.cache.hit, false);
    assert.equal(calls.length, before + 2);
    assert.match(calls.at(-1).messages.at(-1).content, /机械门禁（issue_too_long）/);
    assert.match(calls.at(-1).messages.at(-1).content, /issue 不超过 60 字/);
  });

  await t.test("forwards avoid-anchor hints and keys the review cache on them", async () => {
    const currentPack = {
      env01: "诊断：匿名投票识别学生对集采替代的初始判断",
      env02: "目标：比较集采替代中的质量与可及性权衡 · 评价标准：能说明结论",
      env03: "误区：只比较药价而忽略疗效与患者可及性",
      env04: "证据：待核实集采政策来源与适用范围",
      env05: "任务：用两类证据完成替代决策并说明边界 · 输出：三方决策备忘录",
      env06: "调控：追问证据来源并记录沉默节点",
      env07: "评价：依据评价标准形成学习画像",
      env08: "复盘：比较初始判断与最终决策",
      env09: "沉淀：保存可复用的问题链与评价标准",
    };
    const context = {
      chapterId: "ch5-procurement",
      courseTitle: "药事管理学",
      courseLevel: "本科",
      classTitle: "药管 1 班",
      studentCount: 32,
      sessionTitle: "第 7 周",
      durationMinutes: 45,
      chapterTitle: "集采制度",
      topic: "集采后仿制药替代",
    };
    const avoidAnchors = [
      { targetEnv: "env05", sourceExcerpt: "任务：用两类证据完成替代决策并说明边界" },
      { targetEnv: "env04", sourceExcerpt: "证据：待核实集采政策来源与适用范围" },
    ];
    const withAvoid = { reviewerId: "pharmacy-context", sourceRevision: 5, context, currentPack, avoidAnchors };

    const before = calls.length;
    const response = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withAvoid),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "anchored");
    assert.equal(body.orchestrationVersion, "preexisting-anchor-snapshot-v1");
    assert.equal(body.reviewer.expertId, "expert-pharm");
    assert.equal(body.annotation.targetEnv, "env05");
    assert.equal(calls.length, before + 1);
    assert.match(calls.at(-1).messages[1].content, /<occupied_anchors>/);
    assert.match(calls.at(-1).messages[1].content, /env04 · 证据：待核实集采政策来源与适用范围/);
    assert.match(calls.at(-1).messages[1].content, /env05 · 任务：用两类证据完成替代决策并说明边界/);

    const cachedResponse = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withAvoid),
    });
    assert.equal((await cachedResponse.json()).cache.hit, true);
    assert.equal(calls.length, before + 1, "相同 avoidAnchors 应命中缓存");

    const canonicalCachedResponse = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...withAvoid,
        avoidAnchors: [avoidAnchors[1], avoidAnchors[0], avoidAnchors[1]],
      }),
    });
    assert.equal((await canonicalCachedResponse.json()).cache.hit, true);
    assert.equal(calls.length, before + 1, "avoidAnchors 调序或重复不应制造新缓存键");

    const withoutAvoid = { reviewerId: "pharmacy-context", sourceRevision: 5, context, currentPack };
    const freshResponse = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withoutAvoid),
    });
    assert.equal((await freshResponse.json()).cache.hit, false);
    assert.equal(calls.length, before + 2, "avoidAnchors 变化必须视为不同缓存键");
    assert.doesNotMatch(calls.at(-1).messages[1].content, /<occupied_anchors>/);

    const invalidResponse = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...withAvoid, avoidAnchors: [{ targetEnv: "env99", sourceExcerpt: "不存在的环节" }] }),
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal((await invalidResponse.json()).error.code, "INVALID_AVOID_ANCHORS");
    assert.equal(calls.length, before + 2, "非法 avoidAnchors 不应触发模型调用");
  });

  await t.test("serves anchored reviews from sqlite after a server restart", async () => {
    // 与 "anchors, canonicalizes and caches" 用例完全相同的请求体 → 相同 cacheKey
    const currentPack = {
      env01: "诊断：匿名投票识别学生对集采替代的初始判断",
      env02: "目标：比较集采替代中的质量与可及性权衡 · 评价标准：能说明结论",
      env03: "误区：只比较药价而忽略疗效与患者可及性",
      env04: "证据：待核实集采政策来源与适用范围",
      env05: "任务：用两类证据完成替代决策并说明边界 · 输出：三方决策备忘录",
      env06: "调控：追问证据来源并记录沉默节点",
      env07: "评价：依据评价标准形成学习画像",
      env08: "复盘：比较初始判断与最终决策",
      env09: "沉淀：保存可复用的问题链与评价标准",
    };
    const requestBody = {
      reviewerId: "instructional-design",
      sourceRevision: 3,
      context: {
        chapterId: "ch5-procurement",
        courseTitle: "药事管理学",
        courseLevel: "本科",
        classTitle: "药管 1 班",
        studentCount: 32,
        sessionTitle: "第 7 周",
        durationMinutes: 45,
        chapterTitle: "集采制度",
        topic: "集采后仿制药替代",
      },
      currentPack,
    };
    const strictModel = {
      async status() {
        return { ready: true, endpoint: "http://fake/v1", model: "fake-model", advertisedModels: ["fake-model"] };
      },
      async chat() {
        throw new Error("持久缓存命中时不得调用模型");
      },
    };
    const restarted = createPharmacoServer({ config, database, modelClient: strictModel, logger: { error() {} } });
    await new Promise((resolveListen) => restarted.listen(0, "127.0.0.1", resolveListen));
    const restartedBase = `http://127.0.0.1:${restarted.address().port}`;
    try {
      const response = await fetch(`${restartedBase}/api/practice/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.status, "anchored");
      assert.equal(body.cache.hit, true);
      assert.equal(body.annotation.targetEnv, "env02");
    } finally {
      await new Promise((resolveClose) => restarted.close(resolveClose));
    }
  });

  await t.test("rejects an unknown practice reviewer before inference", async () => {
    const before = calls.length;
    const response = await fetch(`${base}/api/practice/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewerId: "expert-edu", sourceRevision: 0, context: {}, currentPack: {} }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "UNKNOWN_PRACTICE_REVIEWER");
    assert.equal(calls.length, before);
  });
});

test("practice reviewer registry covers five scoped disciplines", () => {
  const reviewers = Object.values(PRACTICE_REVIEWERS);
  assert.equal(reviewers.length, 5);
  assert.deepEqual(
    reviewers.map((reviewer) => reviewer.expertId).sort(),
    ["expert-data", "expert-edu", "expert-law", "expert-mgmt", "expert-pharm"],
  );
  const envKeys = new Set(Array.from({ length: 9 }, (_, index) => `env${String(index + 1).padStart(2, "0")}`));
  const promptVersions = new Set();
  const scopeSignatures = new Set();
  for (const reviewer of reviewers) {
    assert.equal(PRACTICE_REVIEWERS[reviewer.id], reviewer);
    assert.ok(reviewer.scope.length >= 1 && reviewer.scope.length <= 3, `${reviewer.id} scope 应聚焦 1–3 个主责环节`);
    for (const key of reviewer.scope) {
      assert.ok(envKeys.has(key), `${reviewer.id} 的 scope ${key} 不是合法环节`);
      assert.match(reviewer.systemPrompt, new RegExp(key), `${reviewer.id} 的 prompt 未提及主责环节 ${key}`);
    }
    assert.match(reviewer.systemPrompt, /只输出一个 JSON 对象/);
    assert.match(reviewer.systemPrompt, /逐字复制/);
    assert.match(reviewer.systemPrompt, /只提一条主批注/);
    promptVersions.add(reviewer.promptVersion);
    scopeSignatures.add([...reviewer.scope].sort().join(","));
  }
  assert.equal(promptVersions.size, 5, "promptVersion 必须互不相同");
  assert.equal(scopeSignatures.size, 5, "五路 scope 组合必须互相错开，防止审校同质化");
});

test("LAN binding is fail-closed without an API token", () => {
  assert.throws(
    () => loadConfig({ rootDir: resolve("."), host: "0.0.0.0", port: 4173 }),
    /PHARMACO_API_TOKEN/,
  );
});
