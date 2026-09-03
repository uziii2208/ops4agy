import fs from 'fs/promises';
import path from 'path';
import type { SessionRecord } from './types.js';

export class SessionStore {
  private readonly sessionsDir: string;
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(sessionsDir: string) {
    this.sessionsDir = path.resolve(sessionsDir);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await this.loadIndex();
  }

  create(record: SessionRecord): void {
    this.sessions.set(record.id, record);
    this.saveIndex().catch(() => {});
  }

  update(id: string, patch: Partial<SessionRecord>): void {
    const existing = this.sessions.get(id);
    if (existing) {
      Object.assign(existing, patch);
      this.saveIndex().catch(() => {});
    }
  }

  get(id: string): SessionRecord | undefined {
    return this.sessions.get(id);
  }

  list(): SessionRecord[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalPromptsDetected: number;
    totalAutoApproved: number;
    totalBlocked: number;
    totalAntiHallucinationEvents: number;
  } {
    const all = this.list();
    return {
      totalSessions: all.length,
      activeSessions: all.filter((s) => !s.endedAt).length,
      totalPromptsDetected: all.reduce((sum, s) => sum + s.promptsDetected, 0),
      totalAutoApproved: all.reduce((sum, s) => sum + s.promptsAutoApproved, 0),
      totalBlocked: all.reduce((sum, s) => sum + s.promptsBlocked, 0),
      totalAntiHallucinationEvents: all.reduce((sum, s) => sum + (s.antiHallucinationEvents ?? 0), 0),
    };
  }

  private async loadIndex(): Promise<void> {
    try {
      const indexPath = path.join(this.sessionsDir, 'index.json');
      const raw = await fs.readFile(indexPath, 'utf-8');
      const records: SessionRecord[] = JSON.parse(raw);
      for (const r of records) {
        this.sessions.set(r.id, r);
      }
    } catch {
      // no existing index
    }
  }

  private async saveIndex(): Promise<void> {
    const indexPath = path.join(this.sessionsDir, 'index.json');
    const records = Array.from(this.sessions.values());
    await fs.writeFile(indexPath, JSON.stringify(records, null, 2), 'utf-8');
  }
}
