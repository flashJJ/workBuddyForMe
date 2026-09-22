/**
 * 备份恢复：各轨道的实际 DB 写入 SQL 函数。
 * 与 restore.ts 分离以通过 300 行门禁。
 */

type DBRunResult = { changes: number; lastInsertRowid: number | bigint };

/** settings：INSERT ON CONFLICT DO UPDATE（upsert 语义） */
export function restoreSettings(db: any, buf: Buffer): void {
  const raw = JSON.parse(buf.toString('utf-8')) as Record<string, unknown>;
  const stmt = db.prepare(
    `INSERT INTO settings_kv(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const now = new Date().toISOString();
  const tx = db.transaction((pairs: Array<[string, unknown]>) => {
    for (const [k, v] of pairs) stmt.run(k, JSON.stringify(v), now);
  });
  tx(Object.entries(raw));
}

interface KbEntry {
  knowledgeBase: { id: string; name: string; description: string; chunkSize: number; chunkOverlap: number; createdAt: string; updatedAt: string };
  documents: Array<{
    document: { id: string; filename: string; fileType: string; byteSize: number; contentHash: string; status?: string; source?: string; sourceUrl?: string | null; chunkCount?: number; createdAt?: string; indexedAt?: string | null };
    chunks: Array<{ ordinal: number; content: string; charStart: number; charEnd: number }>;
  }>;
}

/** knowledge：INSERT OR IGNORE 幂等跳过；document 恢复后 status 设为 'pending'（向量需重建） */
export function restoreKnowledge(db: any, buf: Buffer): { kb: { imported: number; skipped: number }; doc: { imported: number; skipped: number }; chunk: number } {
  const kbs = JSON.parse(buf.toString('utf-8')) as KbEntry[];
  let kbImported = 0, kbSkipped = 0, docImported = 0, docSkipped = 0, chunkImported = 0;

  const insertKb = db.prepare(
    `INSERT OR IGNORE INTO knowledge_bases(id, name, description, chunk_size, chunk_overlap, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDoc = db.prepare(
    `INSERT OR IGNORE INTO documents(id, knowledge_base_id, filename, file_type, byte_size, content_hash, status, source, source_url, chunk_count, created_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertChunk = db.prepare(
    `INSERT INTO document_chunks(document_id, ordinal, content, char_start, char_end, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  for (const entry of kbs) {
    const r = insertKb.run(entry.knowledgeBase.id, entry.knowledgeBase.name, entry.knowledgeBase.description,
      entry.knowledgeBase.chunkSize, entry.knowledgeBase.chunkOverlap, entry.knowledgeBase.createdAt, entry.knowledgeBase.updatedAt);
    if (r.changes > 0) kbImported++; else kbSkipped++;

    for (const d of entry.documents) {
      const doc = d.document;
      const docRow: DBRunResult = insertDoc.run(doc.id, entry.knowledgeBase.id, doc.filename, doc.fileType, doc.byteSize,
        doc.contentHash, 'pending', doc.source ?? 'upload', doc.sourceUrl ?? null,
        doc.chunkCount ?? d.chunks.length, doc.createdAt ?? new Date().toISOString(), null);
      if (docRow.changes > 0) {
        docImported++;
        const ts = new Date().toISOString();
        for (const c of d.chunks) { insertChunk.run(doc.id, c.ordinal, c.content, c.charStart, c.charEnd, ts); chunkImported++; }
      } else docSkipped++;
    }
  }
  return { kb: { imported: kbImported, skipped: kbSkipped }, doc: { imported: docImported, skipped: docSkipped }, chunk: chunkImported };
}

interface ConvEntry {
  conversation: { id: string; assistantId: string; title: string; lastMessageAt?: string | null; createdAt: string; updatedAt: string };
  messages: Array<{ id: string; role: string; content: string; status: string; citations?: unknown; toolTrace?: unknown; contentParts?: unknown; createdAt?: string }>;
}

/**
 * conversations：INSERT OR IGNORE 幂等跳过。
 * SQLite INSERT OR IGNORE 不忽略外键约束冲突，故先检查 assistant 是否存在。
 */
export function restoreConversations(db: any, buf: Buffer): { convs: { imported: number; skipped: number }; msgs: number } {
  const convs = JSON.parse(buf.toString('utf-8')) as ConvEntry[];
  let convImported = 0, convSkipped = 0, msgImported = 0;

  const assistantExists = db.prepare(`SELECT 1 FROM assistants WHERE id = ?`);
  const convExists = db.prepare(`SELECT 1 FROM conversations WHERE id = ?`);
  const insertConv = db.prepare(
    `INSERT INTO conversations(id, assistant_id, title, last_message_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertMsg = db.prepare(
    `INSERT OR IGNORE INTO messages(id, conversation_id, role, content, status, citations, tool_trace, content_parts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const entry of convs) {
    const c = entry.conversation;
    // 先检查：assistant 必须存在（外键）+ conversation 本身不能存在（幂等）
    const hasAssistant = assistantExists.get(c.assistantId);
    const hasConv = convExists.get(c.id);
    if (!hasAssistant || hasConv) { convSkipped++; continue; }

    insertConv.run(c.id, c.assistantId, c.title, c.lastMessageAt ?? null, c.createdAt, c.updatedAt);
    convImported++;

    for (const m of entry.messages) {
      insertMsg.run(m.id, c.id, m.role, m.content, m.status,
        JSON.stringify(m.citations ?? []), JSON.stringify(m.toolTrace ?? []), JSON.stringify(m.contentParts ?? []),
        m.createdAt ?? new Date().toISOString());
      msgImported++;
    }
  }
  return { convs: { imported: convImported, skipped: convSkipped }, msgs: msgImported };
}

interface AttMeta { id: string; filename: string; mimeType: string; byteSize: number; storagePath: string; contentHash: string; createdAt: string }

/** attachments：INSERT OR IGNORE 幂等跳过；二进制落盘在 restore.ts 主流程中完成 */
export function restoreAttachmentsMeta(db: any, buf: Buffer): { imported: number; skipped: number } {
  const atts = JSON.parse(buf.toString('utf-8')) as AttMeta[];
  let imported = 0, skipped = 0;
  const insertAtt = db.prepare(
    `INSERT OR IGNORE INTO attachments(id, filename, mime_type, byte_size, storage_path, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const a of atts) {
    const r: DBRunResult = insertAtt.run(a.id, a.filename, a.mimeType, a.byteSize, a.storagePath, a.contentHash, a.createdAt);
    if (r.changes > 0) imported++; else skipped++;
  }
  return { imported, skipped };
}
