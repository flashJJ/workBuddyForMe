/**
 * WorkBuddy 数据库查看工具（零额外依赖）。
 *
 * 用法：
 *   node scripts/wbfm-db show-docs                    # 所有文档概览
 *   node scripts/wbfm-db show-doc <filename | id>     # 单文档详情
 *   node scripts/wbfm-db show-chunks <filename | id>  # 单文档分片内容（前 10 片）
 *   node scripts/wbfm-db show-tables                  # 所有表行数
 *   node scripts/wbfm-db where <sql>                  # 任意 SQL（SELECT only）
 *
 * 默认数据根：~/.workbuddy-for-me/db/wbfm.sqlite
 * 可通过环境变量 WBFM_DB_PATH 覆盖
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH =
  process.env.WBFM_DB_PATH ??
  path.join(os.homedir(), '.workbuddy-for-me', 'db', 'wbfm.sqlite');

if (!fs.existsSync(DB_PATH)) {
  console.error(`数据库文件不存在：${DB_PATH}`);
  console.error('可通过 WBFM_DB_PATH 环境变量指定其他位置');
  process.exit(1);
}

// WAL 模式下只读打开即可；加 .db-wal / .db-shm 三个文件同时在才完整
const db = new Database(DB_PATH, { readonly: true });

function resolveDoc(spec) {
  const byId = db.prepare('SELECT * FROM documents WHERE id = ?').get(spec);
  if (byId) return byId;
  const byName = db
    .prepare('SELECT * FROM documents WHERE filename = ? ORDER BY created_at DESC LIMIT 1')
    .get(spec);
  return byName;
}

const cmd = process.argv[2] ?? 'show-docs';
const arg = process.argv[3];

function prettyChunk(c) {
  return `--- ordinal=${c.ordinal}  charStart=${c.char_start}  len=${c.char_end - c.char_start} ---\n${c.content}`;
}

switch (cmd) {
  case 'show-docs': {
    const rows = db
      .prepare(
        `SELECT d.filename, d.status,
          CASE WHEN d.error_message IS NULL OR d.error_message='' THEN ''
               ELSE substr(d.error_message,1,120) END AS err,
          (SELECT COUNT(*) FROM document_chunks c WHERE c.document_id = d.id) AS chunks,
          d.source, d.created_at
        FROM documents d ORDER BY d.created_at DESC`,
      )
      .all();
    console.table(rows);
    break;
  }

  case 'show-doc': {
    if (!arg) { console.error('请传文件名或 id'); process.exit(1); }
    const doc = resolveDoc(arg);
    if (!doc) { console.error('未找到文档:', arg); process.exit(1); }
    console.log(JSON.stringify(doc, null, 2));
    console.log(`\n→ 查看分片：node scripts/wbfm-db show-chunks "${doc.filename}"`);
    break;
  }

  case 'show-chunks': {
    if (!arg) { console.error('请传文件名或 id'); process.exit(1); }
    const doc = resolveDoc(arg);
    if (!doc) { console.error('未找到文档:', arg); process.exit(1); }
    const chunks = db
      .prepare(
        'SELECT ordinal, char_start, char_end, content FROM document_chunks WHERE document_id = ? ORDER BY ordinal',
      )
      .all(doc.id);
    console.log(`=== ${doc.filename} 共 ${chunks.length} 个分片（展示前 10 个）===\n`);
    for (const c of chunks.slice(0, 10)) console.log(prettyChunk(c) + '\n');
    if (chunks.length > 10) console.log(`... 其余 ${chunks.length - 10} 个省略\n`);
    break;
  }

  case 'show-tables': {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    for (const t of tables) {
      try {
        const n = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get().c;
        console.log(`${t.name.padEnd(32)} ${n} rows`);
      } catch (e) {
        console.log(`${t.name.padEnd(32)} (表需要扩展模块加载)`);
      }
    }
    break;
  }

  case 'where': {
    if (!arg) { console.error('请传 SQL 片段'); process.exit(1); }
    const sql = arg.replace(/^where\s+/i, 'WHERE ');
    const full = `SELECT * FROM documents ${sql}`;
    console.log(`SQL: ${full}\n`);
    try {
      const rows = db.prepare(full).all();
      console.table(rows.map((r) => ({
        id: r.id.slice(0, 8) + '…',
        filename: r.filename,
        status: r.status,
        source: r.source,
      })));
      console.log(`\n共 ${rows.length} 行`);
    } catch (e) {
      console.error('SQL 错误：', e.message);
    }
    break;
  }

  default:
    console.error(`未知命令：${cmd}`);
    console.log('可用命令：show-docs / show-doc / show-chunks / show-tables / where');
    process.exit(1);
}

db.close();
