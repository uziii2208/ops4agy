import * as chokidar from 'chokidar';
import { Subject } from 'rxjs';
import path from 'path';
import fs from 'fs/promises';

export interface WorkspaceEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  relativePath: string;
  timestamp: number;
}

export class WorkspaceWatcher {
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private readonly watchPath: string;

  readonly events$ = new Subject<WorkspaceEvent>();

  constructor(workspacePath: string) {
    this.watchPath = path.resolve(workspacePath);
  }

  async start(): Promise<void> {
    await fs.mkdir(this.watchPath, { recursive: true });

    this.watcher = chokidar.watch(this.watchPath, {
      ignoreInitial: true,
      persistent: true,
      depth: 5,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    const handle = (type: WorkspaceEvent['type']) => (filePath: string) => {
      this.events$.next({
        type,
        filePath,
        relativePath: path.relative(this.watchPath, filePath),
        timestamp: Date.now(),
      });
    };

    this.watcher
      .on('add', handle('add'))
      .on('change', handle('change'))
      .on('unlink', handle('unlink'));
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.events$.complete();
  }
}
