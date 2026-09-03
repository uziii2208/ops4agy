import blessed from 'blessed';
import { MasterOrchestrator } from './master-orchestrator.js';
import { PROFILES } from './profiles.js';
import type { CliTarget, ProfileName, MasterOptions } from './types.js';

export class Dashboard {
  private screen!: blessed.Widgets.Screen;
  private workerList!: blessed.Widgets.ListElement;
  private outputBox!: blessed.Widgets.Log;
  private logBox!: blessed.Widgets.Log;
  private statusBar!: blessed.Widgets.BoxElement;
  private inputBar!: blessed.Widgets.TextboxElement;
  private headerBox!: blessed.Widgets.BoxElement;
  private master: MasterOrchestrator;
  private options: MasterOptions;
  private selectedWorker: string | null = null;
  private workerOutputBuffers = new Map<string, string[]>();

  constructor(master: MasterOrchestrator) {
    this.master = master;
    this.options = master.getOptions();
  }

  start(): void {
    this.createScreen();
    this.createLayout();
    this.bindKeys();
    this.subscribeEvents();
    this.updateStatus();
    this.screen.render();
  }

  destroy(): void {
    this.screen.destroy();
  }

  private createScreen(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'ops4agy — Operator Dashboard',
      cursor: { artificial: true, shape: 'line', blink: true, color: 'magenta' },
    });
  }

  private createLayout(): void {
    const profile = PROFILES[this.options.profile];

    // Header
    this.headerBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      style: { fg: 'white', bg: 'black' },
      content:
        `{center}{bold}{magenta-fg}ops4agy{/magenta-fg} v1.0.0 — Operator Dashboard{/bold}  ` +
        `{yellow-fg}[${profile.label}]{/yellow-fg} ${profile.description}{/center}`,
    });

    // Worker list (left panel)
    this.workerList = blessed.list({
      parent: this.screen,
      label: ' Workers (↑↓ select) ',
      top: 3,
      left: 0,
      width: '25%',
      height: '60%-3',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black', bold: true },
        item: { fg: 'white' },
        label: { fg: 'cyan', bold: true } as any,
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollable: true,
      items: ['{gray-fg}No workers{/gray-fg}'],
      tags: true,
    });

    // Output panel (right panel — selected worker's live output)
    this.outputBox = blessed.log({
      parent: this.screen,
      label: ' Terminal Output ',
      top: 3,
      left: '25%',
      width: '75%',
      height: '60%-3',
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { fg: 'green', bold: true },
      },
      scrollable: true,
      scrollbar: { ch: '█', style: { fg: 'green' } },
      mouse: true,
      keys: true,
      vi: true,
      tags: true,
    });

    // Log panel (bottom)
    this.logBox = blessed.log({
      parent: this.screen,
      label: ' Event Log ',
      top: '60%',
      left: 0,
      width: '100%',
      height: '35%',
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow', bold: true } as any,
      },
      scrollable: true,
      scrollbar: { ch: '█', style: { fg: 'yellow' } },
      mouse: true,
      tags: true,
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: { fg: 'white', bg: 'blue' },
    });

    // Input bar
    this.inputBar = blessed.textbox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 'white', bg: 'black' },
      inputOnFocus: true,
    });

    this.inputBar.on('submit', (value: string) => {
      this.handleCommand(value);
      this.inputBar.clearValue();
      this.inputBar.focus();
      this.screen.render();
    });

    this.workerList.on('select item', () => {
      const idx = (this.workerList as any).selected;
      const workers = this.master.listWorkers();
      if (workers[idx]) {
        this.selectedWorker = workers[idx].id;
        this.refreshOutput();
      }
    });

    this.inputBar.focus();
  }

  private bindKeys(): void {
    this.screen.key(['C-c'], () => {
      this.shutdown();
    });

    this.screen.key(['C-n'], () => {
      this.showSpawnDialog();
    });

    this.screen.key(['C-d'], () => {
      if (this.selectedWorker) {
        this.master.killWorker(this.selectedWorker);
        this.logEvent('system', `Killed worker: ${this.selectedWorker}`);
        this.selectedWorker = null;
        this.refreshWorkerList();
      }
    });

    this.screen.key(['C-a'], () => {
      if (this.selectedWorker) {
        this.master.sendToWorker(this.selectedWorker, 'y\r');
        this.logEvent('approve', `Approved: ${this.selectedWorker}`);
      }
    });

    this.screen.key(['C-r'], () => {
      if (this.selectedWorker) {
        this.master.sendToWorker(this.selectedWorker, 'n\r');
        this.logEvent('reject', `Rejected: ${this.selectedWorker}`);
      }
    });

    this.screen.key(['C-p'], () => {
      this.showProfileMenu();
    });

    this.screen.key(['C-s'], () => {
      this.showSettingsMenu();
    });

    this.screen.key(['tab'], () => {
      if ((this.screen as any).focused === this.workerList) {
        this.inputBar.focus();
      } else {
        this.workerList.focus();
      }
      this.screen.render();
    });

    this.screen.key(['f1'], () => {
      this.showHelp();
    });
  }

  private subscribeEvents(): void {
    this.master.events$.subscribe((event) => {
      switch (event.type) {
        case 'SESSION_STARTED':
          this.logEvent('start', `{green-fg}${event.workerId}{/green-fg} started (pid: ${event.data?.pid})`);
          this.workerOutputBuffers.set(event.workerId, []);
          this.refreshWorkerList();
          break;

        case 'SESSION_ENDED':
          this.logEvent('end', `{yellow-fg}${event.workerId}{/yellow-fg} ended (exit: ${event.data?.exitCode})`);
          if (this.selectedWorker === event.workerId) this.selectedWorker = null;
          this.refreshWorkerList();
          break;

        case 'OUTPUT': {
          const buf = this.workerOutputBuffers.get(event.workerId) ?? [];
          const line = (event.data?.output as string) ?? '';
          buf.push(line);
          if (buf.length > 500) buf.splice(0, buf.length - 500);
          this.workerOutputBuffers.set(event.workerId, buf);
          if (this.selectedWorker === event.workerId) {
            this.outputBox.log(line);
          }
          break;
        }

        case 'PROMPT_DETECTED': {
          const match = event.data?.match as Record<string, unknown>;
          this.logEvent('prompt', `{cyan-fg}${event.workerId}{/cyan-fg} [${match?.category}] ${match?.pattern}`);
          this.refreshWorkerList();
          break;
        }

        case 'AUTO_APPROVED':
          this.logEvent('auto', `{green-fg}${event.workerId}{/green-fg} auto-approved: ${event.data?.rule} (${event.data?.delayMs}ms)`);
          this.refreshWorkerList();
          break;

        case 'MANUAL_INTERVENTION_REQUIRED':
          this.logEvent('ALERT', `{red-fg}{bold}${event.workerId} NEEDS MANUAL APPROVAL{/bold}{/red-fg}: ${event.data?.reason}`);
          this.refreshWorkerList();
          break;

        case 'ANTI_HALLUCINATION_TRIGGERED':
          this.logEvent('GUARD', `{red-fg}{bold}ANTI-HALLUCINATION{/bold}{/red-fg} ${event.workerId}: ${event.data?.reason}`);
          break;

        case 'ERROR':
          this.logEvent('error', `{red-fg}${event.workerId}{/red-fg}: ${JSON.stringify(event.data)}`);
          break;
      }

      this.updateStatus();
      this.screen.render();
    });

    this.master.workspaceEvents$.subscribe((event) => {
      this.logEvent('workspace', `{gray-fg}${event.type}: ${event.relativePath}{/gray-fg}`);
      this.screen.render();
    });
  }

  private refreshWorkerList(): void {
    const workers = this.master.listWorkers();
    if (workers.length === 0) {
      this.workerList.setItems(['{gray-fg}No workers — Ctrl+N to spawn{/gray-fg}']);
    } else {
      const items = workers.map((w) => {
        const statusColor =
          w.status === 'running' ? 'green' :
          w.status === 'waiting_human' ? 'red' :
          w.status === 'waiting_prompt' ? 'cyan' :
          'yellow';
        const sel = w.id === this.selectedWorker ? '▸ ' : '  ';
        return `${sel}{${statusColor}-fg}●{/${statusColor}-fg} ${w.id} [${w.stats.promptsAutoApproved}/${w.stats.promptsBlocked}]`;
      });
      this.workerList.setItems(items);
    }
    this.screen.render();
  }

  private refreshOutput(): void {
    this.outputBox.setContent('');
    if (this.selectedWorker) {
      this.outputBox.setLabel(` Terminal: ${this.selectedWorker} `);
      const buf = this.workerOutputBuffers.get(this.selectedWorker) ?? [];
      for (const line of buf.slice(-200)) {
        this.outputBox.log(line);
      }
    } else {
      this.outputBox.setLabel(' Terminal Output ');
    }
    this.screen.render();
  }

  private updateStatus(): void {
    const stats = this.master.getSessionStats();
    const workers = this.master.listWorkers();
    const waiting = workers.filter((w) => w.status === 'waiting_human').length;
    const profile = PROFILES[this.master.getProfile()];

    let statusText =
      ` {bold}Workers:{/bold} ${workers.length}/${this.options.maxWorkers}` +
      `  {bold}Prompts:{/bold} ${stats.totalPromptsDetected}` +
      `  {bold}Auto:{/bold} ${stats.totalAutoApproved}` +
      `  {bold}Blocked:{/bold} ${stats.totalBlocked}` +
      `  {bold}Profile:{/bold} {yellow-fg}${profile.label}{/yellow-fg}`;

    if (waiting > 0) {
      statusText += `  {red-fg}{bold}⚠ ${waiting} WAITING{/bold}{/red-fg}`;
    }

    statusText += `  | F1:Help Ctrl+N:Spawn Ctrl+D:Kill Ctrl+A:Approve Ctrl+P:Profile Ctrl+S:Settings`;

    this.statusBar.setContent(statusText);
  }

  private showSpawnDialog(): void {
    const form = blessed.list({
      parent: this.screen,
      label: ' Spawn Worker ',
      top: 'center',
      left: 'center',
      width: 40,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        selected: { bg: 'magenta', fg: 'white', bold: true },
        label: { fg: 'magenta', bold: true } as any,
      },
      keys: true,
      vi: true,
      mouse: true,
      items: [
        ' claude  — Claude Code CLI',
        ' agy     — Antigravity CLI',
      ],
      tags: true,
    });

    form.on('select', async (_: any, idx: number) => {
      const target: CliTarget = idx === 0 ? 'claude' : 'agy';
      form.destroy();
      this.screen.render();
      try {
        const worker = await this.master.spawnWorker(target, []);
        this.selectedWorker = worker.id;
        this.logEvent('spawn', `Spawned: ${worker.id}`);
        this.refreshWorkerList();
      } catch (err: any) {
        this.logEvent('error', `Spawn failed: ${err.message}`);
      }
    });

    form.key(['escape', 'q'], () => {
      form.destroy();
      this.screen.render();
    });

    form.focus();
    this.screen.render();
  }

  private showProfileMenu(): void {
    const profiles = Object.values(PROFILES);
    const items = profiles.map((p) => {
      const active = p.name === this.options.profile ? '{green-fg}● ' : '  ';
      return `${active}${p.label.padEnd(10)} ${p.description}{/green-fg}`;
    });

    const menu = blessed.list({
      parent: this.screen,
      label: ' Switch Profile ',
      top: 'center',
      left: 'center',
      width: 70,
      height: profiles.length + 4,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        selected: { bg: 'yellow', fg: 'black', bold: true },
        label: { fg: 'yellow', bold: true } as any,
      },
      keys: true,
      vi: true,
      mouse: true,
      items,
      tags: true,
    });

    menu.on('select', (_: any, idx: number) => {
      const newProfile = profiles[idx];
      this.master.setProfile(newProfile.name);
      this.options.profile = newProfile.name;
      this.logEvent('profile', `Switched to {yellow-fg}${newProfile.label}{/yellow-fg}: ${newProfile.description}`);
      this.headerBox.setContent(
        `{center}{bold}{magenta-fg}ops4agy{/magenta-fg} v1.0.0 — Operator Dashboard{/bold}  ` +
        `{yellow-fg}[${newProfile.label}]{/yellow-fg} ${newProfile.description}{/center}`,
      );
      this.updateStatus();
      menu.destroy();
      this.screen.render();
    });

    menu.key(['escape', 'q'], () => {
      menu.destroy();
      this.screen.render();
    });

    menu.focus();
    this.screen.render();
  }

  private showSettingsMenu(): void {
    const settings = [
      `Auto-approve:     ${this.options.autoApprove ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `Log to file:      ${this.options.logToFile ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `Max workers:      ${this.options.maxWorkers}`,
      `Buffer window:    ${this.options.config.bufferWindowMs}ms`,
      `Inject delay:     ${this.options.config.injectDelayMin}-${this.options.config.injectDelayMax}ms`,
      `Anti-hallucinate: ${this.options.config.antiHallucination.enabled ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `Profile:          {yellow-fg}${PROFILES[this.options.profile].label}{/yellow-fg}`,
      `───────────────────────`,
      `Toggle auto-approve`,
      `Toggle log to file`,
      `Toggle anti-hallucination`,
    ];

    const menu = blessed.list({
      parent: this.screen,
      label: ' Settings ',
      top: 'center',
      left: 'center',
      width: 50,
      height: settings.length + 4,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black', bold: true },
        label: { fg: 'cyan', bold: true } as any,
      },
      keys: true,
      vi: true,
      mouse: true,
      items: settings,
      tags: true,
    });

    menu.on('select', (_: any, idx: number) => {
      if (idx === 8) {
        this.options.autoApprove = !this.options.autoApprove;
        this.logEvent('settings', `Auto-approve: ${this.options.autoApprove ? 'ON' : 'OFF'}`);
      } else if (idx === 9) {
        this.options.logToFile = !this.options.logToFile;
        this.logEvent('settings', `Log to file: ${this.options.logToFile ? 'ON' : 'OFF'}`);
      } else if (idx === 10) {
        this.options.config.antiHallucination.enabled = !this.options.config.antiHallucination.enabled;
        this.logEvent('settings', `Anti-hallucination: ${this.options.config.antiHallucination.enabled ? 'ON' : 'OFF'}`);
      }
      menu.destroy();
      this.updateStatus();
      this.screen.render();
    });

    menu.key(['escape', 'q'], () => {
      menu.destroy();
      this.screen.render();
    });

    menu.focus();
    this.screen.render();
  }

  private showHelp(): void {
    const helpText = [
      '{bold}{magenta-fg}ops4agy Operator Dashboard{/magenta-fg}{/bold}',
      '',
      '{bold}Keyboard Shortcuts:{/bold}',
      '  Ctrl+N    Spawn new worker',
      '  Ctrl+D    Kill selected worker',
      '  Ctrl+A    Approve selected worker (send y)',
      '  Ctrl+R    Reject selected worker (send n)',
      '  Ctrl+P    Switch operation profile',
      '  Ctrl+S    Settings menu',
      '  Tab       Switch focus (workers ↔ input)',
      '  ↑/↓       Navigate worker list',
      '  F1        This help',
      '  Ctrl+C    Shutdown & exit',
      '',
      '{bold}Commands (type in input bar):{/bold}',
      '  spawn <agy|claude> [...args]',
      '  kill <worker-id>',
      '  send <worker-id> <text>',
      '  approve <worker-id>',
      '  reject <worker-id>',
      '  profile <name>',
      '  stats',
      '  history',
      '',
      '{bold}Profiles:{/bold}',
      '  safe     — Read-only, all writes blocked',
      '  audit    — Security audit, bash+tools auto',
      '  ctf      — Full YOLO, everything approved',
      '  recon    — Recon tools auto, writes blocked',
      '  paranoid — Everything blocked for review',
    ].join('\n');

    const help = blessed.box({
      parent: this.screen,
      label: ' Help (ESC to close) ',
      top: 'center',
      left: 'center',
      width: 55,
      height: 34,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true } as any,
      },
      content: helpText,
      tags: true,
      scrollable: true,
      keys: true,
      mouse: true,
    });

    help.key(['escape', 'q', 'f1'], () => {
      help.destroy();
      this.screen.render();
    });

    help.focus();
    this.screen.render();
  }

  private async handleCommand(input: string): Promise<void> {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0];
    if (!cmd) return;

    switch (cmd) {
      case 'spawn': {
        const raw = (parts[1] || 'claude').toLowerCase();
        const targetMap: Record<string, CliTarget> = { agy: 'agy', ag: 'agy', antigravity: 'agy', claude: 'claude' };
        const target = targetMap[raw];
        if (!target) {
          this.logEvent('error', 'Target must be "agy" or "claude"');
          return;
        }
        try {
          const worker = await this.master.spawnWorker(target, parts.slice(2));
          this.selectedWorker = worker.id;
          this.logEvent('spawn', `Spawned: ${worker.id}`);
          this.refreshWorkerList();
        } catch (err: any) {
          this.logEvent('error', err.message);
        }
        break;
      }

      case 'kill': {
        const id = parts[1] ?? this.selectedWorker;
        if (!id) { this.logEvent('error', 'Usage: kill <worker-id>'); return; }
        const killed = await this.master.killWorker(id);
        this.logEvent(killed ? 'kill' : 'error', killed ? `Killed ${id}` : `${id} not found`);
        if (killed && this.selectedWorker === id) this.selectedWorker = null;
        this.refreshWorkerList();
        break;
      }

      case 'send': {
        const id = parts[1];
        const text = parts.slice(2).join(' ') + '\r';
        if (!id) { this.logEvent('error', 'Usage: send <worker-id> <text>'); return; }
        const sent = this.master.sendToWorker(id, text);
        this.logEvent(sent ? 'send' : 'error', sent ? `Sent to ${id}` : `${id} not found`);
        break;
      }

      case 'approve': {
        const id = parts[1] ?? this.selectedWorker;
        if (!id) { this.logEvent('error', 'Usage: approve <worker-id>'); return; }
        this.master.sendToWorker(id, 'y\r');
        this.logEvent('approve', `Approved ${id}`);
        break;
      }

      case 'reject': {
        const id = parts[1] ?? this.selectedWorker;
        if (!id) { this.logEvent('error', 'Usage: reject <worker-id>'); return; }
        this.master.sendToWorker(id, 'n\r');
        this.logEvent('reject', `Rejected ${id}`);
        break;
      }

      case 'profile': {
        const name = parts[1] as ProfileName;
        if (!PROFILES[name]) {
          this.logEvent('error', `Unknown profile: ${name}. Options: safe, audit, ctf, recon, paranoid`);
          return;
        }
        this.master.setProfile(name);
        this.options.profile = name;
        const p = PROFILES[name];
        this.headerBox.setContent(
          `{center}{bold}{magenta-fg}ops4agy{/magenta-fg} v1.0.0 — Operator Dashboard{/bold}  ` +
          `{yellow-fg}[${p.label}]{/yellow-fg} ${p.description}{/center}`,
        );
        this.logEvent('profile', `Switched to ${p.label}`);
        break;
      }

      case 'stats': {
        const s = this.master.getSessionStats();
        this.logEvent('stats',
          `Sessions: ${s.totalSessions} | Active: ${s.activeSessions} | ` +
          `Prompts: ${s.totalPromptsDetected} | Auto: ${s.totalAutoApproved} | Blocked: ${s.totalBlocked}`,
        );
        break;
      }

      case 'history': {
        const sessions = this.master.getSessionHistory().slice(0, 5);
        for (const s of sessions) {
          this.logEvent('history',
            `${s.id} [${s.target}] ${s.endedAt ? 'ended' : 'active'} ` +
            `prompts: ${s.promptsDetected}/${s.promptsAutoApproved}/${s.promptsBlocked}`,
          );
        }
        break;
      }

      default:
        this.logEvent('error', `Unknown: ${cmd}. F1 for help.`);
    }

    this.updateStatus();
  }

  private logEvent(source: string, message: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    this.logBox.log(`{gray-fg}${ts}{/gray-fg} {bold}[${source}]{/bold} ${message}`);
  }

  private async shutdown(): Promise<void> {
    await this.master.shutdown();
    this.screen.destroy();
    process.exit(0);
  }
}
