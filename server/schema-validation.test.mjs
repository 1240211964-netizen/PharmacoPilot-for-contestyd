// 产品内核六个 JSON Schema 契约的校验测试:
// 每个 schema 的合法 fixture 必须通过;每个非法 fixture 必须抛
// SchemaValidationError(code=SCHEMA_VALIDATION_FAILED)且错误信息指明字段路径。
// 后半部分覆盖 v1.0.1 增量:双版本路由、写入版本分发、1.0.0 -> 1.0.1 向后兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSchemas,
  validateAgainstSchema,
  getWriteSchemaVersion,
  CURRENT_SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  SchemaValidationError,
} from './product-core/schemas.mjs';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../schemas/fixtures/v1',
);
const FIXTURE_DIR_V101 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../schemas/fixtures/v1.0.1',
);

const SCHEMAS = [
  'runtime-observation',
  'evidence-reference',
  'teaching-claim',
  'teaching-decision-record',
  'teacher-decision',
  'model-run',
];

// 每种非法 fixture 原因 -> 错误信息中必须出现的字段名
const EXPECTED_FIELD = {
  'runtime-observation': {
    'missing-required': 'courseId',
    'bad-enum': 'observationType',
    'extra-property': 'unexpectedField',
    'bad-schema-version': 'schemaVersion',
    'bad-datetime': 'calculatedAt',
    'bad-id-pattern': 'observationId',
  },
  'evidence-reference': {
    'missing-required': 'sourceId',
    'bad-enum': 'evidenceType',
    'extra-property': 'unexpectedField',
    'bad-schema-version': 'schemaVersion',
    'bad-datetime': 'retrievedAt',
    'bad-id-pattern': 'evidenceId',
  },
  'teaching-claim': {
    'missing-required': 'statement',
    'bad-enum': 'claimType',
    'extra-property': 'unexpectedField',
    'bad-schema-version': 'schemaVersion',
    'bad-datetime': 'createdAt',
    'bad-id-pattern': 'claimId',
  },
  'teaching-decision-record': {
    'missing-required': 'decisionQuestion',
    'bad-enum': 'status',
    'extra-property': 'unexpectedField',
    'bad-schema-version': 'schemaVersion',
    'bad-datetime': 'createdAt',
    'bad-id-pattern': 'decisionRecordId',
  },
  'teacher-decision': {
    'missing-required': 'decisionRecordId',
    'bad-enum': 'decision',
    'extra-property': 'unexpectedField',
    'bad-schema-version': 'schemaVersion',
    'bad-datetime': 'decidedAt',
    'bad-id-pattern': 'teacherDecisionId',
  },
  'model-run': {
    'missing-required': 'workflowId',
    'bad-enum': 'provider',
    'extra-property': 'unexpectedField',
    'bad-schema-version': 'schemaVersion',
    'bad-datetime': 'startedAt',
    'bad-id-pattern': 'modelRunId',
  },
};

async function readFixture(file) {
  return JSON.parse(await readFile(path.join(FIXTURE_DIR, file), 'utf8'));
}

test('listSchemas 返回全部六个 schema', async () => {
  const names = await listSchemas();
  assert.deepEqual(names, [...SCHEMAS].sort());
});

test('未知 schema 名报错而非静默', async () => {
  await assert.rejects(() => validateAgainstSchema('no-such-schema', {}), /Unknown schema/);
});

for (const name of SCHEMAS) {
  test(`${name}: 合法 fixture 通过校验`, async () => {
    const obj = await readFixture(`${name}.valid.json`);
    assert.equal(await validateAgainstSchema(name, obj), true);
  });

  test(`${name}: 全部非法 fixture 失败且错误信息指明字段路径`, async () => {
    const files = (await readdir(FIXTURE_DIR))
      .filter((f) => f.startsWith(`${name}.invalid-`) && f.endsWith('.json'))
      .sort();
    assert.ok(
      files.length >= 5,
      `${name} 至少需要 5 个非法 fixture,实际 ${files.length} 个`,
    );
    for (const file of files) {
      const reason = file.slice(
        `${name}.invalid-`.length,
        -'.json'.length,
      );
      const obj = await readFixture(file);
      let err = null;
      try {
        await validateAgainstSchema(name, obj);
      } catch (e) {
        err = e;
      }
      assert.ok(err, `${file} 应当校验失败`);
      assert.ok(
        err instanceof SchemaValidationError,
        `${file}: 错误类型应为 SchemaValidationError,实际 ${err?.constructor?.name}`,
      );
      assert.equal(err.code, 'SCHEMA_VALIDATION_FAILED', `${file}: code 不符`);
      const expectedField = EXPECTED_FIELD[name][reason];
      assert.ok(expectedField, `未登记 ${name} 的非法原因 "${reason}" 的期望字段`);
      assert.ok(
        err.message.includes(`/${expectedField}`),
        `${file}: 错误信息应包含字段路径 "/${expectedField}",实际:\n${err.message}`,
      );
    }
  });

  test(`${name}: 错误 schemaVersion 必失败`, async () => {
    const obj = await readFixture(`${name}.valid.json`);
    obj.schemaVersion = '9.9.9';
    await assert.rejects(
      () => validateAgainstSchema(name, obj),
      (e) => e.code === 'SCHEMA_VALIDATION_FAILED' && e.message.includes('/schemaVersion'),
    );
  });

  test(`${name}: 多余字段必失败`, async () => {
    const obj = await readFixture(`${name}.valid.json`);
    obj.someBogusField = 123;
    await assert.rejects(
      () => validateAgainstSchema(name, obj),
      (e) => e.code === 'SCHEMA_VALIDATION_FAILED' && e.message.includes('/someBogusField'),
    );
  });
}

// ---------- v1.0.1 增量(仅放宽校验的兼容 PATCH) ----------

const PATCHED_SCHEMAS = ['evidence-reference', 'teaching-decision-record'];
const UNPATCHED_SCHEMAS = SCHEMAS.filter((s) => !PATCHED_SCHEMAS.includes(s));

// 每种 v1.0.1 非法 fixture 原因 -> 错误信息中必须出现的字段名
const EXPECTED_FIELD_V101 = {
  'evidence-reference': {
    'bad-source-id': 'sourceId',
    'bad-schema-version': 'schemaVersion',
  },
  'teaching-decision-record': {
    'bad-lesson-version-id': 'sourceLessonVersionId',
    'bad-schema-version': 'schemaVersion',
  },
};

async function readFixtureV101(file) {
  return JSON.parse(await readFile(path.join(FIXTURE_DIR_V101, file), 'utf8'));
}

test('版本常量:CURRENT_SCHEMA_VERSION 为 1.0.1,LEGACY 为 1.0.0', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, '1.0.1');
  assert.equal(LEGACY_SCHEMA_VERSION, '1.0.0');
});

test('getWriteSchemaVersion:两个增量 schema 写 1.0.1,其余仍写 1.0.0', async () => {
  for (const name of PATCHED_SCHEMAS) {
    assert.equal(await getWriteSchemaVersion(name), '1.0.1', name);
  }
  for (const name of UNPATCHED_SCHEMAS) {
    assert.equal(await getWriteSchemaVersion(name), '1.0.0', name);
  }
  await assert.rejects(() => getWriteSchemaVersion('no-such-schema'), /Unknown schema/);
});

for (const name of PATCHED_SCHEMAS) {
  test(`v1.0.1 ${name}: 合法 fixture 通过校验(显式版本与自动路由)`, async () => {
    const files = (await readdir(FIXTURE_DIR_V101))
      .filter((f) => f.startsWith(`${name}.valid`) && f.endsWith('.json'))
      .sort();
    assert.ok(files.length >= 1, `${name} 至少需要 1 个 v1.0.1 合法 fixture`);
    for (const file of files) {
      const obj = await readFixtureV101(file);
      assert.equal(await validateAgainstSchema(name, obj, { schemaVersion: '1.0.1' }), true, `${file}(显式 1.0.1)`);
      assert.equal(await validateAgainstSchema(name, obj), true, `${file}(按 schemaVersion 自动路由)`);
    }
  });

  test(`v1.0.1 ${name}: 全部非法 fixture 失败且错误信息指明字段路径`, async () => {
    const files = (await readdir(FIXTURE_DIR_V101))
      .filter((f) => f.startsWith(`${name}.invalid-`) && f.endsWith('.json'))
      .sort();
    assert.ok(files.length >= 2, `${name} 至少需要 2 个 v1.0.1 非法 fixture,实际 ${files.length} 个`);
    for (const file of files) {
      const reason = file.slice(`${name}.invalid-`.length, -'.json'.length);
      const obj = await readFixtureV101(file);
      let err = null;
      try {
        // 显式按 1.0.1 校验:即使 fixture 内 schemaVersion 被篡改也对其 const 报错。
        await validateAgainstSchema(name, obj, { schemaVersion: '1.0.1' });
      } catch (e) {
        err = e;
      }
      assert.ok(err, `${file} 应当校验失败`);
      assert.ok(err instanceof SchemaValidationError, `${file}: 错误类型应为 SchemaValidationError`);
      assert.equal(err.code, 'SCHEMA_VALIDATION_FAILED', `${file}: code 不符`);
      const expectedField = EXPECTED_FIELD_V101[name][reason];
      assert.ok(expectedField, `未登记 v1.0.1 ${name} 的非法原因 "${reason}" 的期望字段`);
      assert.ok(
        err.message.includes(`/${expectedField}`),
        `${file}: 错误信息应包含字段路径 "/${expectedField}",实际:\n${err.message}`,
      );
    }
  });
}

test('向后兼容:1.0.0 的 teaching-decision-record 数据在 1.0.1 schema 下仍合法', async () => {
  const obj = await readFixture('teaching-decision-record.valid.json');
  obj.schemaVersion = '1.0.1'; // 仅升级版本声明,数据体不变(kav_ 前缀被 1.0.1 保留接受)
  assert.equal(await validateAgainstSchema('teaching-decision-record', obj, { schemaVersion: '1.0.1' }), true);
});

test('向后兼容:1.0.0 的 evidence-reference 数据在 1.0.1 schema 下仍合法', async () => {
  const obj = await readFixture('evidence-reference.valid.json');
  obj.schemaVersion = '1.0.1';
  assert.equal(await validateAgainstSchema('evidence-reference', obj, { schemaVersion: '1.0.1' }), true);
});

test('版本路由:schemaVersion=1.0.0 的对象走 v1 文件(lvr_ 在 v1 下被拒)', async () => {
  const obj = await readFixtureV101('teaching-decision-record.valid.json');
  obj.schemaVersion = '1.0.0'; // 声明 1.0.0 -> 路由到 v1 -> lvr_ 不匹配 v1 的 ^kav_ pattern
  await assert.rejects(
    () => validateAgainstSchema('teaching-decision-record', obj),
    (e) => e.code === 'SCHEMA_VALIDATION_FAILED' && e.message.includes('/sourceLessonVersionId'),
  );
});

test('1.0.1 新能力:runtime_observation 型证据(obs_ sourceId)在 v1 下不合法', async () => {
  const obj = await readFixtureV101('evidence-reference.valid-runtime-observation.json');
  // 1.0.1 下合法(正向覆盖新能力)
  assert.equal(await validateAgainstSchema('evidence-reference', obj), true);
  // 同一数据体放到 v1:sourceId 仅允许 ^ka_,obs_ 被拒 —— 证明这是 1.0.1 的放宽
  obj.schemaVersion = '1.0.0';
  await assert.rejects(
    () => validateAgainstSchema('evidence-reference', obj),
    (e) => e.code === 'SCHEMA_VALIDATION_FAILED' && e.message.includes('/sourceId'),
  );
});

test('读兼容回归:v1 全部合法 fixture 按 1.0.0 路由仍通过', async () => {
  for (const name of SCHEMAS) {
    const obj = await readFixture(`${name}.valid.json`);
    assert.equal(obj.schemaVersion, '1.0.0', `${name} v1 fixture 应声明 1.0.0`);
    assert.equal(await validateAgainstSchema(name, obj), true, `${name} 自动路由`);
    assert.equal(await validateAgainstSchema(name, obj, { schemaVersion: '1.0.0' }), true, `${name} 显式 1.0.0`);
  }
});
