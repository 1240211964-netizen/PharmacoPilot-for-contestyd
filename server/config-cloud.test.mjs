import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.mjs";

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("云平台 PORT 优先于 PHARMACO_PORT", () => {
  const snapshot = {
    PORT: process.env.PORT,
    PHARMACO_PORT: process.env.PHARMACO_PORT,
  };

  try {
    process.env.PORT = "5123";
    process.env.PHARMACO_PORT = "4174";

    const config = loadConfig({ rootDir: process.cwd() });
    assert.equal(config.port, 5123);
  } finally {
    restoreEnv(snapshot);
  }
});

test("未提供 PORT 时继续兼容 PHARMACO_PORT", () => {
  const snapshot = {
    PORT: process.env.PORT,
    PHARMACO_PORT: process.env.PHARMACO_PORT,
  };

  try {
    delete process.env.PORT;
    process.env.PHARMACO_PORT = "4174";

    const config = loadConfig({ rootDir: process.cwd() });
    assert.equal(config.port, 4174);
  } finally {
    restoreEnv(snapshot);
  }
});
