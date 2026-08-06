# 试用运维手册(管理员向)

面向试用期间的值班管理员:教师开户/撤销、数据备份、异常恢复、试用间隙重置。
工程约定:纯 ESM Node 22(≥22.5),零新依赖;数据目录默认 `<仓库根>/.pharmaco-data`,可用环境变量 `PHARMACO_DATA_DIR` 覆盖。

## 1. 教师开户与撤销(manage-teachers CLI)

所有子命令直接对数据目录操作(会自动跑 migration,可在服务停机和运行两种状态下使用):

```bash
# 开户:生成教师账号 + 试用令牌
node tools/manage-teachers.mjs add --name "张老师" --role teacher [--label "备注"]

# 列出账号与令牌(只显示哈希指纹,不显示明文令牌)
node tools/manage-teachers.mjs list

# 撤销单个令牌(教师令牌丢失/泄露时)
node tools/manage-teachers.mjs revoke --token-id tok_xxx

# 停用整个教师账号(其所有令牌随即失效)
node tools/manage-teachers.mjs disable --teacher tch_xxx
```

纪律:

- `add` 的明文令牌(`pk_<48 位随机>`)**只在 stdout 打印一次**,库里只存 sha256 哈希;丢失无法找回,只能 `revoke` 后重新 `add`;
- 令牌通过 `Authorization: Bearer pk_...`(或 `x-pharmaco-token` 头)鉴权;教师令牌绑定真实身份,请求里自报的 actorId/reviewerId 与令牌不一致会被 403 拒绝;
- 未配置静态 token 的回环开发态(本机 127.0.0.1)放行,仅供管理员本机调试,不要对局域网开放。

## 2. 数据备份

全部业务数据都在数据目录的三个文件里:

```
.pharmaco-data/pharmaco.sqlite       主库
.pharmaco-data/pharmaco.sqlite-wal   预写日志(WAL 模式,最近写入先落这里)
.pharmaco-data/pharmaco.sqlite-shm   WAL 共享内存索引
```

备份步骤:

1. **先正常停止服务**(Ctrl+C),让 WAL 回并主库;运行中直接拷贝可能漏掉 WAL 里的最新数据;
2. 三个文件**一起**复制走(缺 -wal/-shm 时 SQLite 能恢复,但可能丢未回并事务);
3. 恢复:三个文件放回原目录、改回原名,启动即可。

另:试用间隙用 `tools/reset-trial-data.mjs` 做的归档(`pharmaco.archive-<时间戳>.sqlite*`)也是完整备份,改回 `pharmaco.sqlite*` 原名即可回到该时点。

## 3. 异常恢复

### 端口被占用

- 启动器(`启动3D教室.command`)会自动 +1 顺延,看终端打印的实际端口;
- 手动启动:`PORT=4180 npm start`(或 `PHARMACO_PORT=4180`);
- 查占用:`lsof -i :4173`。

### 模型网关(8080)未启动的降级行为

- **S1 课前诊断闭环不受影响**:建课/导入/算事实/生成/校验/裁决/发布/审计全部走规则引擎(`generateClaimsRuleBased`),不调用任何模型;
- 受影响的是旧版智能体对话:`GET /api/model/status` 返回 503 `{ready:false}`,`POST /api/chat` 等代理路由不可用;
- 需要对话功能时:先起本地 MLX 网关(默认 `http://127.0.0.1:8080/v1`,可用 `PHARMACO_MODEL_BASE_URL` 改),再重启服务。

### 数据库锁(busy_timeout)

- 库开了 `PRAGMA busy_timeout = 5000`:并发写入最多排队 5 秒,超时报 `database is locked`;
- 常见于:服务运行中又用 CLI/另一个进程写同一个库。先停服再跑 CLI,或等写操作结束重试;
- 若怀疑死锁残留:停服后确认无 `node` 进程持有该目录,再启动(WAL 会自动恢复)。

### migration 失败的报错含义

启动时 migration runner 逐字节校验已应用的 migration:

- `schema migration "00X_..." was modified after being applied (recorded sha256 ..., current ...); refusing to continue`
  → **已应用的迁移文件被改动过**。migration 文件落地后不允许再改;请从 git 恢复该文件原貌(`git checkout -- server/migrations/00X_*.sql`),不要手改 SQL 去"适配"数据库;
- `schema migration "00X_..." is recorded as applied but its file is missing ...; refusing to continue`
  → 数据库记录已应用,但迁移文件被删了。从 git 恢复文件即可;
- `failed to apply schema migration "00X_...": <原因>`
  → 新迁移执行失败(数据库损坏或 SQL 与现有数据冲突)。此时库处于该迁移之前的一致状态(事务已回滚);先备份三个文件,再排查;
- 以上报错都是"拒绝继续"而非静默跳过——宁可起不来,不可带病运行。

## 4. 试用间隙安全重置(tools/reset-trial-data.mjs)

归档式重置:**不删除任何文件、不动追加式表结构**,把库文件改名归档,下次启动自动全新 migration 重建。

```bash
# 预演(默认,只打印计划不动文件)
node tools/reset-trial-data.mjs

# 确认执行
node tools/reset-trial-data.mjs --confirm

# 指定数据目录(与 PHARMACO_DATA_DIR 同口径)
node tools/reset-trial-data.mjs --data-dir /path/to/data --confirm
```

行为与边界:

- 只处理白名单三个文件:`pharmaco.sqlite`、`pharmaco.sqlite-wal`、`pharmaco.sqlite-shm`,重命名为 `pharmaco.archive-<UTC 时间戳>.sqlite*`;目录内其他文件(含旧归档)一律不碰;
- 归档目标同名已存在时中止,绝不覆盖旧归档;
- 执行前**先停服务**(对运行中的库 rename 会让服务端句柄失效);
- 回滚:停服,把归档文件改回 `pharmaco.sqlite*` 原名即可;
- 重置后教师账号也被清空(存在库里),需要重新 `manage-teachers.mjs add` 开户。

## 5. 试用前自检清单

```bash
npm run test:backend   # 后端全绿(含审计规范视图与重置工具)
node tools/manage-teachers.mjs add --name "试用教师" --role teacher   # 开好户,记下 pk_ 令牌
npm start              # 起服务,浏览器开 /s1-workspace.html 走一遍闭环
```
