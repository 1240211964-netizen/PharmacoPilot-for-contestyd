// S1 前测 CSV 导入通道测试:真实 HTTP 服务 + 临时 DB。
// 覆盖:合法 CSV 全链路(导入→算事实→生成→校验→裁决→发布)、表头错、选项非法、
// 引用不存在 item、重复行、公式注入转义、行级错误聚合、原子性(有错零写入)、
// replace 冲突与 acknowledgeRecompute、模板端点、匿名 ID 格式拒绝、旧 fixture 通道兼容。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createPharmacoServer } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";

const ACTOR = { actorId: "teacher-csv" };

const noModelClient = {
  async status() {
    return { ready: false, endpoint: "http://127.0.0.1:1/v1", model: "none", advertisedModels: [] };
  },
  async chat() {
    throw new Error("S1 闭环不允许调用任何模型");
  },
};

// 合法小样本:2 题 × 3 学生;含引号/逗号转义与 participated=0 未作答行。
const ITEMS_CSV = [
  "item_no,stem,options,correct_option,knowledge_tags,optionTexts",
  '1,"题干一,含逗号",A|B|C|D,B,药代动力学;生物利用度,A:文本甲|B:文本乙|C:文本丙|D:文本丁',
  '2,"题干二""含引号""",A|B|C|D,A,处方管理,A:1 日|B:2 日|C:3 日|D:7 日',
  "",
].join("\n");

const RESPONSES_CSV = [
  "student_anon_id,item_no,selected_option,participated,knowledge_level,experience_profile",
  "stu_01,1,B,1,基础,无实习经验",
  "stu_01,2,A,1,基础,无实习经验",
  "stu_02,1,A,1,中等,药房实习",
  "stu_02,2,,0,中等,药房实习",
  "stu_03,1,B,1,良好,医院实习",
  "stu_03,2,C,1,良好,医院实习",
  "",
].join("\n");

async function api(base, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, body: json };
}

function expectError(result, status, code) {
  assert.equal(result.status, status, `期望 ${status},实际 ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, "string");
}

test("S1 前测 CSV 导入通道", async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "pharmaco-pretest-import-"));
  const config = loadConfig({
    rootDir: resolve("."),
    dataDir: tempDir,
    host: "127.0.0.1",
    port: 0,
    modelBaseUrl: "http://127.0.0.1:1/v1",
    modelName: "no-model",
  });
  const database = new PharmacoDatabase(config.dataDir);
  const server = createPharmacoServer({ config, database, modelClient: noModelClient, logger: { error() {} } });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  let seq = 0;
  // 建 课程→班级→课时→工作流,返回 { workflowId, lessonId }。
  async function setupWorkflow() {
    seq += 1;
    const course = await api(base, "POST", "/api/product-core/courses", {
      name: `药事管理学-csv-${seq}`, code: `PHA-CSV-${seq}`, ...ACTOR,
    });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    const cohort = await api(base, "POST", `/api/product-core/courses/${course.body.course.id}/cohorts`, {
      name: `csv 班-${seq}`, academicTerm: "2026-2027-1", ...ACTOR,
    });
    assert.equal(cohort.status, 201, JSON.stringify(cohort.body));
    const lesson = await api(base, "POST", "/api/product-core/lessons", {
      courseId: course.body.course.id, classId: cohort.body.cohort.id, title: `CSV 课时-${seq}`, ...ACTOR,
    });
    assert.equal(lesson.status, 201, JSON.stringify(lesson.body));
    const workflow = await api(base, "POST", "/api/product-core/s1/workflows", {
      courseId: course.body.course.id, classId: cohort.body.cohort.id, lessonId: lesson.body.lesson.id, ...ACTOR,
    });
    assert.equal(workflow.status, 201, JSON.stringify(workflow.body));
    return { workflowId: workflow.body.workflow.id, lessonId: lesson.body.lesson.id };
  }

  function importCsv(workflowId, overrides = {}) {
    return api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/import-pretest`, {
      itemsCsv: ITEMS_CSV, responsesCsv: RESPONSES_CSV, ...ACTOR, ...overrides,
    });
  }

  function rowCount(sql, ...params) {
    return database.db.prepare(sql).get(...params).n;
  }

  await t.test("模板端点返回两份 CSV 模板,且模板内容可直接导入", async () => {
    const tpl = await api(base, "GET", "/api/product-core/s1/pretest-template");
    assert.equal(tpl.status, 200, JSON.stringify(tpl.body));
    assert.match(tpl.body.itemsCsv, /^item_no,stem,options,correct_option,knowledge_tags/);
    assert.match(tpl.body.responsesCsv, /^student_anon_id,item_no,selected_option,participated/);

    const { workflowId } = await setupWorkflow();
    const result = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/import-pretest`, {
      itemsCsv: tpl.body.itemsCsv, responsesCsv: tpl.body.responsesCsv, ...ACTOR,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.import.itemCount, 2);
    assert.equal(result.body.import.responseCount, 4);
    assert.equal(result.body.workflow.currentState, "INPUT_READY");
  });

  await t.test("合法 CSV 全链路:导入→算事实→生成→校验→裁决→发布", async () => {
    const { workflowId, lessonId } = await setupWorkflow();

    const imported = await importCsv(workflowId);
    assert.equal(imported.status, 200, JSON.stringify(imported.body));
    assert.equal(imported.body.workflow.currentState, "INPUT_READY");
    assert.deepEqual(imported.body.import, { itemCount: 2, responseCount: 6, studentCount: 3, replaced: false });

    // 引号/逗号转义正确落库
    const stems = database.db
      .prepare("SELECT item_no, stem FROM pretest_items WHERE lesson_id = ? ORDER BY item_no")
      .all(lessonId);
    assert.equal(stems[0].stem, "题干一,含逗号");
    assert.equal(stems[1].stem, '题干二"含引号"');

    // 审计 input.imported:只有计数,不含学生原始数据
    const audit = database.db
      .prepare("SELECT payload_json FROM audit_events WHERE event_type = 'input.imported' AND entity_id = ?")
      .get(lessonId);
    const payload = JSON.parse(audit.payload_json);
    assert.equal(payload.itemCount, 2);
    assert.equal(payload.responseCount, 6);
    assert.equal(payload.source, "csv");
    assert.ok(!audit.payload_json.includes("stu_01"), "审计 payload 不得含学生匿名 ID");

    const facts = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/compute-facts`, ACTOR);
    assert.equal(facts.status, 200, JSON.stringify(facts.body));
    assert.equal(facts.body.workflow.currentState, "FACTS_COMPUTED");

    const claims = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/generate-claims`, ACTOR);
    assert.equal(claims.status, 200, JSON.stringify(claims.body));

    const validated = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/validate`, ACTOR);
    assert.equal(validated.status, 200, JSON.stringify(validated.body));
    assert.equal(validated.body.workflow.currentState, "TEACHER_REVIEW");
    assert.equal(validated.body.gate.failed, 0, JSON.stringify(validated.body.gate.results));

    const view = (await api(base, "GET", `/api/product-core/s1/workflows/${workflowId}`)).body;
    assert.ok(view.decisionRecords.length > 0);
    for (const record of view.decisionRecords) {
      const decided = await api(base, "POST", `/api/product-core/s1/decision-records/${record.id}/decisions`, {
        decision: "accept", reviewerId: ACTOR.actorId,
      });
      assert.equal(decided.status, 201, JSON.stringify(decided.body));
    }
    const published = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/publish`, ACTOR);
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.workflow.currentState, "PUBLISHED");
    assert.ok(published.body.artifact.observedFacts.length > 0);
  });

  await t.test("表头错误:缺必需列报行级错误", async () => {
    const { workflowId } = await setupWorkflow();
    const bad = await importCsv(workflowId, {
      itemsCsv: "item_no,stem,options,knowledge_tags\n1,题干,A|B,标签\n",
    });
    expectError(bad, 422, "PRETEST_CSV_INVALID");
    const missing = bad.body.error.details.errors.find((e) => e.field === "correct_option");
    assert.ok(missing, JSON.stringify(bad.body.error.details.errors));
    assert.match(missing.message, /缺少必需列/);
  });

  await t.test("选项非法 + correct_option 越界 + 聚合多类错误一次返回", async () => {
    const { workflowId } = await setupWorkflow();
    const badItems = [
      "item_no,stem,options,correct_option,knowledge_tags",
      "1,题干一,A|B|A,B,标签", // 选项重复
      "2,题干二,A|B,Z,标签", // correct_option 不在 options 内
      "x,题干三,A|B,A,标签", // item_no 非整数
      "",
    ].join("\n");
    const bad = await importCsv(workflowId, { itemsCsv: badItems });
    expectError(bad, 422, "PRETEST_CSV_INVALID");
    const errors = bad.body.error.details.errors;
    assert.ok(errors.length >= 3, JSON.stringify(errors));
    assert.ok(errors.some((e) => e.row === 2 && e.field === "options"));
    assert.ok(errors.some((e) => e.row === 3 && e.field === "correct_option"));
    assert.ok(errors.some((e) => e.row === 4 && e.field === "item_no"));
  });

  await t.test("responses 引用不存在的 item_no + 重复作答 + 匿名 ID 格式 + participated 非法", async () => {
    const { workflowId, lessonId } = await setupWorkflow();
    const badResponses = [
      "student_anon_id,item_no,selected_option,participated",
      "stu_01,99,A,1", // item 不存在
      "stu_01,1,A,1",
      "stu_01,1,B,1", // 重复作答
      "学生甲,1,A,1", // 匿名 ID 非法(真实姓名样式,格式校验拒绝)
      "stu_02,1,A,2", // participated 非法
      "stu_03,1,Z,1", // selected_option 不在选项内
      "",
    ].join("\n");
    const bad = await importCsv(workflowId, { responsesCsv: badResponses });
    expectError(bad, 422, "PRETEST_CSV_INVALID");
    const errors = bad.body.error.details.errors;
    assert.ok(errors.some((e) => e.row === 2 && e.field === "item_no" && /不存在/.test(e.message)), JSON.stringify(errors));
    assert.ok(errors.some((e) => e.row === 4 && /重复作答/.test(e.message)));
    assert.ok(errors.some((e) => e.row === 5 && e.field === "student_anon_id"));
    assert.ok(errors.some((e) => e.row === 6 && e.field === "participated"));
    assert.ok(errors.some((e) => e.row === 7 && e.field === "selected_option"));

    // 原子性:整批有错 → 零写入
    assert.equal(rowCount("SELECT COUNT(*) AS n FROM pretest_items WHERE lesson_id = ?", lessonId), 0);
    assert.equal(
      rowCount(
        "SELECT COUNT(*) AS n FROM pretest_responses r JOIN pretest_items i ON i.id = r.item_id WHERE i.lesson_id = ?",
        lessonId,
      ),
      0,
    );
    assert.equal(
      rowCount("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'input.imported' AND entity_id = ?", lessonId),
      0,
    );
  });

  await t.test("公式注入转义:= + - @ 前缀单元格加 ' 落库", async () => {
    const { workflowId, lessonId } = await setupWorkflow();
    const evilItems = [
      "item_no,stem,options,correct_option,knowledge_tags",
      '1,"=HYPERLINK(""http://evil"",""x"")",A|B|C|D,A,+药代动力学',
      "",
    ].join("\n");
    const ok = await importCsv(workflowId, {
      itemsCsv: evilItems,
      responsesCsv: "student_anon_id,item_no,selected_option,participated\nstu_01,1,A,1\n",
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const row = database.db.prepare("SELECT stem, knowledge_tags_json FROM pretest_items WHERE lesson_id = ?").get(lessonId);
    assert.equal(row.stem, "'=HYPERLINK(\"http://evil\",\"x\")");
    assert.deepEqual(JSON.parse(row.knowledge_tags_json), ["'+药代动力学"]);
  });

  await t.test("replace 冲突、覆盖导入与 acknowledgeRecompute", async () => {
    const { workflowId, lessonId } = await setupWorkflow();
    const first = await importCsv(workflowId);
    assert.equal(first.status, 200, JSON.stringify(first.body));

    // 已有数据且 replace=false → 409
    const conflict = await importCsv(workflowId);
    expectError(conflict, 409, "PRETEST_DATA_EXISTS");

    // replace=true → 同事务删旧换新,DRAFT 之外不重复转移(保持 INPUT_READY)
    const replaced = await importCsv(workflowId, { replace: true });
    assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
    assert.equal(replaced.body.import.replaced, true);
    assert.equal(replaced.body.workflow.currentState, "INPUT_READY");
    assert.equal(rowCount("SELECT COUNT(*) AS n FROM pretest_items WHERE lesson_id = ?", lessonId), 2);

    // 算过事实后 replace 需 acknowledgeRecompute
    const facts = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/compute-facts`, ACTOR);
    assert.equal(facts.status, 200, JSON.stringify(facts.body));
    const needAck = await importCsv(workflowId, { replace: true });
    expectError(needAck, 409, "PRETEST_RECOMPUTE_ACK_REQUIRED");
    const acked = await importCsv(workflowId, { replace: true, acknowledgeRecompute: true });
    assert.equal(acked.status, 200, JSON.stringify(acked.body));
    assert.equal(acked.body.import.replaced, true);
    // 不自动重算:旧 observations 仍在,由教师再点 compute
    assert.ok(rowCount("SELECT COUNT(*) AS n FROM runtime_observations WHERE lesson_id = ?", lessonId) > 0);
  });

  await t.test("缺字段与空 body 参数校验", async () => {
    const { workflowId } = await setupWorkflow();
    const missing = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/import-pretest`, {
      responsesCsv: RESPONSES_CSV, ...ACTOR,
    });
    expectError(missing, 400, "INVALID_PRODUCT_CORE_BODY");
    const empty = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/import-pretest`, {
      itemsCsv: "  ", responsesCsv: RESPONSES_CSV, ...ACTOR,
    });
    expectError(empty, 400, "INVALID_PRODUCT_CORE_BODY");
    const notFound = await api(base, "POST", "/api/product-core/s1/workflows/wf_none/import-pretest", {
      itemsCsv: ITEMS_CSV, responsesCsv: RESPONSES_CSV, ...ACTOR,
    });
    expectError(notFound, 404, "WF_INSTANCE_NOT_FOUND");
  });

  await t.test("旧 fixture 通道(input/fixturePath)保持兼容", async () => {
    const { workflowId } = await setupWorkflow();
    const legacy = await api(base, "POST", `/api/product-core/s1/workflows/${workflowId}/input`, {
      fixturePath: "server/product-core/fixtures/pretest-s1.fixture.json", ...ACTOR,
    });
    assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
    assert.equal(legacy.body.workflow.currentState, "INPUT_READY");
  });
});
