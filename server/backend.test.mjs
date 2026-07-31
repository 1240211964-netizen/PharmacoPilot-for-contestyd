import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createPharmacoServer } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";

test("PharmacoPilot backend contract", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-backend-test-"));
  const calls = [];
  const generatedPack = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`env${String(index + 1).padStart(2, "0")}`, `环节 ${index + 1} · 可观察产出`]),
  );
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
    assert.match(await page.text(), /PharmacoPilot/);

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
    assert.equal(request.maxTokens, 1_200);
    assert.match(request.messages[0].content, /不得虚构政策文号/);
    assert.match(request.messages[1].content, /集采后仿制药替代/);
    assert.match(request.messages[1].content, /2026 级药管 1 班/);
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
});

test("LAN binding is fail-closed without an API token", () => {
  assert.throws(
    () => loadConfig({ rootDir: resolve("."), host: "0.0.0.0", port: 4173 }),
    /PHARMACO_API_TOKEN/,
  );
});
