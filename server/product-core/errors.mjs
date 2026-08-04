// 产品内核统一错误类型:仿照 server/app.mjs 的 HttpError 风格,
// 所有领域错误显式抛出并携带稳定 code(对齐 docs/product-core/s1-state-machine.md §5 错误码表),
// 绝不静默吞错。status 供 HTTP 路由层映射;details 携带结构化上下文(如 from/action)。
export class ProductCoreError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ProductCoreError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function fail(status, code, message, details) {
  throw new ProductCoreError(status, code, message, details);
}

// 冻结文档 §5 错误码(服务层使用;触发器层面的 IMMUTABLE_RECORD 由 SQLite RAISE 抛出)。
export const ERROR_CODES = Object.freeze({
  WF_ILLEGAL_TRANSITION: 409,
  WF_VERSION_CONFLICT: 409,
  WF_INSTANCE_NOT_FOUND: 404,
  GATE_VALIDATION_FAILED: 422,
  PUBLISH_NO_TEACHER_DECISION: 422,
  PUBLISH_REJECTED_CONTENT: 422,
  IMMUTABLE_RECORD: 409,
  EVIDENCE_ANCHOR_INVALID: 422,
  OBSERVATION_RECALC_MISMATCH: 422,
  CROSS_SCOPE_REFERENCE: 422,
  SCHEMA_VERSION_MISMATCH: 400,
  // 服务层补充码(不在冻结表内,但同属显式错误):
  PRETEST_FIXTURE_INVALID: 422,
  TEACHER_DECISION_INVALID: 422,
  PROVIDER_NOT_ENABLED: 422,
  PROVIDER_CONTRACT_VIOLATION: 422,
  // 知识库(migration 006 知识层)补充码:
  KB_MANIFEST_INVALID: 422,
  KB_SOURCE_HASH_MISMATCH: 422,
  KB_UNIT_INPUT_INVALID: 422,
  KB_UNIT_NOT_FOUND: 404,
  KB_FRAGMENT_NOT_FOUND: 422,
  KB_REVIEW_STATUS_INVALID: 422,
  // 知识检索与引用完整性(knowledge-retrieval-service)补充码:
  KB_RETRIEVAL_INPUT_INVALID: 422,
  KB_RETRIEVAL_WORKFLOW_NOT_FOUND: 404,
  KB_WORKFLOW_SCOPE_REQUIRED: 422,
  KB_CITATION_INPUT_INVALID: 422,
  KB_RETRIEVAL_RUN_NOT_FOUND: 404,
});

export function failCode(code, message, details) {
  const status = ERROR_CODES[code] ?? 500;
  fail(status, code, message, details);
}
