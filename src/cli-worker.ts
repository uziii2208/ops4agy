import * as pty from 'node-pty';
import { Subject, BehaviorSubject } from 'rxjs';
import stripAnsi from 'strip-ansi';
import type { WorkerEvent, WorkerOptions, WorkerStatus, PromptMatch, PromptRule, Config } from './types.js';
import { matchPrompt, buildRules } from './prompt-rules.js';
import { detectPlatform } from './platform.js';
import { getProfile, shouldAutoApprove } from './profiles.js';
import { AntiHallucinationGuard } from './anti-hallucination.js';
import { Logger } from './logger.js';

export class CliWorker {
  readonly id: string;
  private ptyProcess: pty.IPty | null = null;
  private buffer = '';
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly options: WorkerOptions;
  private readonly rules: PromptRule[];
  private readonly logger: Logger;
  private readonly config: Config;
  private readonly guard: AntiHallucinationGuard;
  private seq = 0;

  private promptsDetected = 0;
  private promptsAutoApproved = 0;
  private promptsBlocked = 0;
  private antiHallucinationEvents = 0;

  readonly events$ = new Subject<WorkerEvent>();
  readonly status$ = new BehaviorSubject<WorkerStatus>('idle');

  constructor(options: WorkerOptions, config: Config, logger: Logger) {
    this.id = options.id;
    this.options = options;
    this.config = config;
    this.logger = logger;
    this.rules = buildRules(config);
    this.guard = new AntiHallucinationGuard(config);
  }

  async start(): Promise<void> {
    const platform = detectPlatform();
    const shellArgs = platform.shellArgs(this.options.command, this.options.args);

    this.ptyProcess = pty.spawn(platform.shell, shellArgs, {
      name: 'xterm-256color',
      cols: this.config.ptyOptions.cols,
      rows: this.config.ptyOptions.rows,
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env } as Record<string, string>,
    });

    this.status$.next('running');
    this.emit('SESSION_STARTED', {
      target: this.options.target,
      profile: this.options.profile,
      pid: this.ptyProcess.pid,
      command: this.options.command,
      args: this.options.args,
      cwd: this.options.cwd,
    });

    this.ptyProcess.onData((raw: string) => {
      const stripped = stripAnsi(raw);
      // eslint-disable-next-line no-control-regex
      const clean = stripped.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      this.emit('OUTPUT', { output: clean });
      this.appendBuffer(raw);
      if (this.options.logToFile) {
        this.logger.writeLog(this.id, clean.trimEnd()).catch(() => {});
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.status$.next('terminated');
      this.emit('SESSION_ENDED', {
        exitCode,
        promptsDetected: this.promptsDetected,
        promptsAutoApproved: this.promptsAutoApproved,
        promptsBlocked: this.promptsBlocked,
        antiHallucinationEvents: this.antiHallucinationEvents,
      });
      this.flushBuffer();
    });
  }

  private appendBuffer(raw: string): void {
    this.buffer += raw;
    if (this.bufferTimer) clearTimeout(this.bufferTimer);
    this.bufferTimer = setTimeout(() => this.evaluateBuffer(), this.config.bufferWindowMs);
  }

  private flushBuffer(): void {
    this.buffer = '';
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
  }

  private evaluateBuffer(): void {
    const clean = stripAnsi(this.buffer);
    const rule = matchPrompt(clean, this.rules);

    if (!rule) return;

    this.promptsDetected++;

    const match: PromptMatch = {
      pattern: rule.name,
      matched: clean.slice(-300),
      safe: rule.safe,
      category: rule.category,
    };

    this.emit('PROMPT_DETECTED', { match });

    const guardResult = this.guard.validate(rule.name, clean.slice(-200));
    if (!guardResult.valid) {
      this.antiHallucinationEvents++;
      this.promptsBlocked++;
      this.status$.next('waiting_human');
      this.emit('ANTI_HALLUCINATION_TRIGGERED', {
        match,
        reason: guardResult.reason,
        guardStats: this.guard.getStats(),
      });
      this.emit('MANUAL_INTERVENTION_REQUIRED', {
        match,
        reason: `anti-hallucination: ${guardResult.reason}`,
      });
      return;
    }

    const profile = getProfile(this.options.profile);
    const allowed = this.options.autoApprove &&
      shouldAutoApprove(profile, rule.category, rule.name, rule.safe);

    if (allowed) {
      this.status$.next('waiting_prompt');
      const { injectDelayMin, injectDelayMax } = this.config;
      const delay = injectDelayMin + Math.random() * (injectDelayMax - injectDelayMin);
      setTimeout(() => {
        this.write(rule.response);
        this.status$.next('running');
        this.promptsAutoApproved++;
        this.emit('AUTO_APPROVED', {
          rule: rule.name,
          category: rule.category,
          profile: this.options.profile,
          response: rule.response,
          delayMs: Math.round(delay),
        });
        this.flushBuffer();
      }, delay);
    } else {
      this.status$.next('waiting_human');
      this.promptsBlocked++;
      this.emit('MANUAL_INTERVENTION_REQUIRED', {
        match,
        reason: rule.safe
          ? `blocked by profile [${profile.label}]`
          : `dangerous pattern: ${rule.name}`,
      });
    }
  }

  write(data: string): void {
    this.ptyProcess?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess?.resize(cols, rows);
  }

  kill(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  getStats(): {
    promptsDetected: number;
    promptsAutoApproved: number;
    promptsBlocked: number;
    antiHallucinationEvents: number;
  } {
    return {
      promptsDetected: this.promptsDetected,
      promptsAutoApproved: this.promptsAutoApproved,
      promptsBlocked: this.promptsBlocked,
      antiHallucinationEvents: this.antiHallucinationEvents,
    };
  }

  private emit(type: WorkerEvent['type'], data?: Record<string, unknown>): void {
    this.events$.next({
      type,
      workerId: this.id,
      timestamp: Date.now(),
      seq: ++this.seq,
      data,
    });
  }
}
