import { loadConfig } from "./config.mjs";
import { PharmacoDatabase } from "./db.mjs";
import { createPharmacoServer } from "./app.mjs";
import { ModelClient } from "./model-client.mjs";

const config = loadConfig();
const database = new PharmacoDatabase(config.dataDir);
const modelClient = new ModelClient(config);
const server = createPharmacoServer({ config, database, modelClient });

server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`PharmacoPilot 后端已启动: http://${config.host}:${port}`);
  console.log(`状态库: ${database.path}`);
  console.log(`本地模型: ${config.modelBaseUrl} → ${config.modelName}`);
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n收到 ${signal}，正在关闭…`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
