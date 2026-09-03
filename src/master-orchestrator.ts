import { Subject, Subscription } from 'rxjs';
import { CliWorker } from './cli-worker.js';
import { WorkspaceWatcher, type WorkspaceEvent } from './workspace-watcher.js';
import { SessionStore } from './session-store.js';
import { Logger } from './logger.js';
import type { WorkerEvent, WorkerOptions, MasterOptions, CliTarget, SessionRecord, ProfileName } from './types.js';
import chalk from 'chalk';
import path from 'path';

export class MasterOrchestrator {
  private readonly workers = new Map<string, CliWorker>();
  private readonly options: MasterOptions;
  private readonly watcher: WorkspaceWatcher;
  private readonly sessionStore: SessionStore;
  private readonly logger: Logger;
  private readonly subscriptions: Subscription[] = [];
  private workerCounter = 0;
  private currentProfile: ProfileName;

  readonly events$ = new Subject<WorkerEvent>();
  readonly workspaceEvents$ = new Subject<WorkspaceEvent>();

  constructor(options: MasterOptions) {
    this.options = options;
    this.currentProfile = options.profile;
    this.watcher = new WorkspaceWatcher(options.workspacePath);
    this.sessionStore = new SessionStore(options.sessionsPath);
    this.logger = new Logger(options.sessionsPath);
  }

  private setupWorkspaceWatcher(): void {
    const sub = this.watcher.events$.subscribe((event) => {
      this.workspaceEvents$.next(event);
      this.logger.info('workspace', `${event.type}: ${event.relativePath}`);
    });
    this.subscriptions.push(sub);
  }

  getOptions(): MasterOptions {
    return this.options;
  }

  getProfile(): ProfileName {
    return this.currentProfile;
  }

  setProfile(profile: ProfileName): void {
    this.currentProfile = profile;
    this.logger.info('master', chalk.magenta(`Profile switched to: ${profile.toUpperCase()}`));
  }

  async spawnWorker(
    target: CliTarget,
    args: string[] = [],
    cwd?: string,
  ): Promise<CliWorker> {
    if (this.workers.size >= this.options.maxWorkers) {
      throw new Error(
        `Max workers (${this.options.maxWorkers}) reached. Kill a worker first.`,
      );
    }

    this.workerCounter++;
    const id = `${target}-${this.workerCounter}`;
    const command = target === 'ag' ? 'ag' : 'claude';

    const workerOpts: WorkerOptions = {
      id,
      target,
      command,
      args,
      cwd: cwd ?? process.cwd(),
      autoApprove: this.options.autoApprove,
      logToFile: this.options.logToFile,
      profile: this.currentProfile,
    };

    const workerLogger = new Logger(this.options.sessionsPath);
    if (this.options.logToFile) {
      await workerLogger.initSessionLog(id);
    }

    const worker = new CliWorker(workerOpts, this.options.config, workerLogger);

    const sub = worker.events$.subscribe((event) => {
      this.events$.next(event);
      this.handleWorkerEvent(event);
    });
    this.subscriptions.push(sub);

    this.workers.set(id, worker);

    const session: SessionRecord = {
      id,
      target,
      profile: this.currentProfile,
      startedAt: new Date().toISOString(),
      promptsDetected: 0,
      promptsAutoApproved: 0,
      promptsBlocked: 0,
      antiHallucinationEvents: 0,
    };
    this.sessionStore.create(session);

    await worker.start();

    return worker;
  }

  private handleWorkerEvent(event: WorkerEvent): void {
    switch (event.type) {
      case 'SESSION_STARTED':
        this.logger.info(event.workerId, chalk.green(
          `Session started (pid: ${event.data?.pid}, target: ${event.data?.target}, profile: ${event.data?.profile})`,
        ));
        break;

      case 'SESSION_ENDED': {
        this.logger.info(event.workerId, chalk.yellow(
          `Session ended (exit: ${event.data?.exitCode})`,
        ));
        const stats = event.data as Record<string, unknown>;
        this.sessionStore.update(event.workerId, {
          endedAt: new Date().toISOString(),
          exitCode: stats?.exitCode as number,
          promptsDetected: stats?.promptsDetected as number,
          promptsAutoApproved: stats?.promptsAutoApproved as number,
          promptsBlocked: stats?.promptsBlocked as number,
          antiHallucinationEvents: stats?.antiHallucinationEvents as number,
        });
        this.workers.delete(event.workerId);
        break;
      }

      case 'PROMPT_DETECTED': {
        const match = event.data?.match as Record<string, unknown>;
        this.logger.info(event.workerId, chalk.cyan(
          `Prompt detected [${match?.category}]: ${match?.pattern}`,
        ));
        const session = this.sessionStore.get(event.workerId);
        if (session) session.promptsDetected++;
        break;
      }

      case 'AUTO_APPROVED':
        this.logger.info(event.workerId, chalk.green(
          `Auto-approved [${event.data?.category}]: ${event.data?.rule} (${event.data?.delayMs}ms) [${event.data?.profile}]`,
        ));
        break;

      case 'ANTI_HALLUCINATION_TRIGGERED': {
        const match = event.data?.match as Record<string, unknown>;
        this.logger.alert(event.workerId, chalk.red.bold(
          `ANTI-HALLUCINATION: ${event.data?.reason}`,
        ));
        this.logger.alert(event.workerId, `Pattern: ${match?.pattern}, Context: ${(match?.matched as string)?.slice(-100)}`);
        const session = this.sessionStore.get(event.workerId);
        if (session) session.antiHallucinationEvents++;
        break;
      }

      case 'MANUAL_INTERVENTION_REQUIRED': {
        const match = event.data?.match as Record<string, unknown>;
        this.logger.alert(event.workerId, `MANUAL INTERVENTION REQUIRED`);
        this.logger.alert(event.workerId, `Reason: ${event.data?.reason}`);
        this.logger.alert(event.workerId, `Context: ${(match?.matched as string)?.slice(-150)}`);
        break;
      }

      case 'OUTPUT':
        break;

      case 'ERROR':
        this.logger.error(event.workerId, `Error: ${JSON.stringify(event.data)}`);
        break;
    }
  }

  getWorker(id: string): CliWorker | undefined {
    return this.workers.get(id);
  }

  listWorkers(): { id: string; status: string; stats: ReturnType<CliWorker['getStats']> }[] {
    return Array.from(this.workers.entries()).map(([id, w]) => ({
      id,
      status: w.status$.getValue(),
      stats: w.getStats(),
    }));
  }

  async killWorker(id: string): Promise<boolean> {
    const worker = this.workers.get(id);
    if (!worker) return false;
    worker.kill();
    this.workers.delete(id);
    this.sessionStore.update(id, { endedAt: new Date().toISOString() });
    return true;
  }

  sendToWorker(id: string, input: string): boolean {
    const worker = this.workers.get(id);
    if (!worker) return false;
    worker.write(input);
    return true;
  }

  getSessionHistory(): SessionRecord[] {
    return this.sessionStore.list();
  }

  getSessionStats() {
    return this.sessionStore.getStats();
  }

  async start(): Promise<void> {
    await this.sessionStore.init();
    this.setupWorkspaceWatcher();
    await this.watcher.start();

    this.logger.info('master', chalk.green.bold('ops4agy orchestrator started'));
    this.logger.info('master', `Workspace: ${path.resolve(this.options.workspacePath)}`);
    this.logger.info('master', `Sessions:  ${path.resolve(this.options.sessionsPath)}`);
    this.logger.info('master', `Workers:   max ${this.options.maxWorkers}`);
    this.logger.info('master', `Profile:   ${this.currentProfile.toUpperCase()}`);
    this.logger.info('master', `Auto-approve: ${this.options.autoApprove}`);
    this.logger.info('master', `Log to file: ${this.options.logToFile}`);
  }

  async shutdown(): Promise<void> {
    this.logger.info('master', chalk.yellow('Shutting down...'));
    for (const [id, worker] of this.workers) {
      worker.kill();
      this.sessionStore.update(id, { endedAt: new Date().toISOString() });
      this.logger.info(id, 'Killed');
    }
    this.workers.clear();
    await this.watcher.stop();
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.events$.complete();
    await this.logger.close();
    this.logger.info('master', chalk.yellow('Shutdown complete'));
  }
}
