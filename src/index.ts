import { Command } from 'commander';
import { MasterOrchestrator } from './master-orchestrator.js';
import { loadConfig, mergeConfigWithFlags } from './config.js';
import type { CliTarget, ProfileName } from './types.js';
import { ProfileNameSchema } from './types.js';
import { listProfiles } from './profiles.js';
import chalk from 'chalk';
import readline from 'readline';
import path from 'path';

const BANNER = `
  ╔═══════════════════════════════════════════╗
  ║          ops4agy v1.0.0                   ║
  ║   Autonomous CLI Orchestrator Daemon      ║
  ║   for AGY & Claude Code                   ║
  ╚═══════════════════════════════════════════╝
`;

function resolveProfile(profileStr?: string, configProfile?: ProfileName): ProfileName {
  if (profileStr) {
    const parsed = ProfileNameSchema.safeParse(profileStr);
    if (!parsed.success) {
      console.error(chalk.red(`Invalid profile: ${profileStr}. Valid: safe, audit, ctf, recon, paranoid`));
      process.exit(1);
    }
    return parsed.data;
  }
  return configProfile ?? 'audit';
}

const program = new Command();

program
  .name('ops4agy')
  .description('Autonomous Master-Worker daemon for AGY/Claude Code CLI orchestration')
  .version('1.0.0');

program
  .command('start')
  .description('Start the ops4agy orchestrator daemon with interactive REPL')
  .option('-w, --workspace <path>', 'mcp2agy workspace path')
  .option('-s, --sessions <path>', 'Session logs directory')
  .option('-m, --max-workers <n>', 'Maximum concurrent workers')
  .option('-c, --config <path>', 'Path to config file (ops4agy.config.json)')
  .option('-p, --profile <name>', 'Operation profile (safe|audit|ctf|recon|paranoid)')
  .option('--no-auto-approve', 'Disable automatic prompt approval')
  .option('--no-log', 'Disable session file logging')
  .action(async (opts) => {
    console.log(chalk.magenta(BANNER));

    const config = await loadConfig(opts.config);
    const merged = mergeConfigWithFlags(config, {
      workspacePath: opts.workspace,
      sessionsPath: opts.sessions,
      maxWorkers: opts.maxWorkers ? parseInt(opts.maxWorkers, 10) : undefined,
      autoApprove: opts.autoApprove,
      logToFile: opts.log,
    } as any);

    const profile = resolveProfile(opts.profile, merged.profile);

    const master = new MasterOrchestrator({
      workspacePath: path.resolve(merged.workspacePath),
      sessionsPath: path.resolve(merged.sessionsPath),
      maxWorkers: merged.maxWorkers,
      autoApprove: merged.autoApprove,
      logToFile: merged.logToFile,
      profile,
      config: merged,
    });

    await master.start();

    process.on('SIGINT', async () => {
      await master.shutdown();
      process.exit(0);
    });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt(chalk.magenta('ops4agy> '));
    rl.prompt();

    rl.on('line', async (line: string) => {
      const parts = line.trim().split(/\s+/);
      const cmd = parts[0];

      try {
        switch (cmd) {
          case 'spawn': {
            const target = (parts[1] || 'claude') as CliTarget;
            if (target !== 'ag' && target !== 'claude') {
              console.log(chalk.red('Target must be "ag" or "claude"'));
              break;
            }
            const args = parts.slice(2);
            const worker = await master.spawnWorker(target, args);
            console.log(chalk.green(`Spawned worker: ${worker.id} [profile: ${master.getProfile()}]`));
            break;
          }

          case 'list': {
            const workers = master.listWorkers();
            if (workers.length === 0) {
              console.log(chalk.yellow('No active workers'));
            } else {
              console.log(chalk.bold('\n  Active Workers:'));
              for (const w of workers) {
                const statusColor = w.status === 'running' ? chalk.green
                  : w.status === 'waiting_human' ? chalk.red
                  : w.status === 'waiting_prompt' ? chalk.cyan
                  : chalk.yellow;
                console.log(
                  `  ${chalk.bold(w.id)} ${statusColor(w.status)} ` +
                  `| prompts: ${w.stats.promptsDetected} auto: ${w.stats.promptsAutoApproved} blocked: ${w.stats.promptsBlocked} ah: ${w.stats.antiHallucinationEvents}`,
                );
              }
              console.log();
            }
            break;
          }

          case 'kill': {
            const id = parts[1];
            if (!id) { console.log(chalk.red('Usage: kill <worker-id>')); break; }
            const killed = await master.killWorker(id);
            console.log(killed ? chalk.green(`Killed ${id}`) : chalk.red(`Worker ${id} not found`));
            break;
          }

          case 'send': {
            const id = parts[1];
            const input = parts.slice(2).join(' ') + '\r';
            if (!id) { console.log(chalk.red('Usage: send <worker-id> <input>')); break; }
            const sent = master.sendToWorker(id, input);
            console.log(sent ? chalk.green('Sent') : chalk.red(`Worker ${id} not found`));
            break;
          }

          case 'approve': {
            const id = parts[1];
            if (!id) { console.log(chalk.red('Usage: approve <worker-id>')); break; }
            const approved = master.sendToWorker(id, 'y\r');
            console.log(approved ? chalk.green(`Approved ${id}`) : chalk.red(`Worker ${id} not found`));
            break;
          }

          case 'reject': {
            const id = parts[1];
            if (!id) { console.log(chalk.red('Usage: reject <worker-id>')); break; }
            const rejected = master.sendToWorker(id, 'n\r');
            console.log(rejected ? chalk.green(`Rejected ${id}`) : chalk.red(`Worker ${id} not found`));
            break;
          }

          case 'profile': {
            const newProfile = parts[1];
            if (!newProfile) {
              console.log(chalk.bold(`Current profile: ${master.getProfile().toUpperCase()}`));
              console.log(chalk.gray('Available: safe, audit, ctf, recon, paranoid'));
              break;
            }
            const parsed = ProfileNameSchema.safeParse(newProfile);
            if (!parsed.success) {
              console.log(chalk.red(`Invalid profile. Available: safe, audit, ctf, recon, paranoid`));
              break;
            }
            master.setProfile(parsed.data);
            console.log(chalk.green(`Profile set to: ${parsed.data.toUpperCase()}`));
            break;
          }

          case 'stats': {
            const stats = master.getSessionStats();
            console.log(chalk.bold('\n  Session Statistics:'));
            console.log(`  Total sessions:       ${stats.totalSessions}`);
            console.log(`  Active sessions:      ${stats.activeSessions}`);
            console.log(`  Prompts detected:     ${stats.totalPromptsDetected}`);
            console.log(`  Auto-approved:        ${stats.totalAutoApproved}`);
            console.log(`  Blocked:              ${stats.totalBlocked}`);
            console.log(`  Anti-hallucination:   ${stats.totalAntiHallucinationEvents}`);
            console.log(`  Current profile:      ${master.getProfile().toUpperCase()}`);
            console.log();
            break;
          }

          case 'history': {
            const sessions = master.getSessionHistory().slice(0, 10);
            if (sessions.length === 0) {
              console.log(chalk.yellow('No session history'));
            } else {
              console.log(chalk.bold('\n  Recent Sessions:'));
              for (const s of sessions) {
                const status = s.endedAt ? chalk.gray('ended') : chalk.green('active');
                console.log(
                  `  ${chalk.bold(s.id)} [${s.target}/${s.profile}] ${status} ` +
                  `started: ${s.startedAt.slice(0, 19)} ` +
                  `prompts: ${s.promptsDetected}/${s.promptsAutoApproved}/${s.promptsBlocked} ah: ${s.antiHallucinationEvents}`,
                );
              }
              console.log();
            }
            break;
          }

          case 'profiles': {
            console.log(chalk.bold('\n  Available Profiles:'));
            for (const p of listProfiles()) {
              const active = p.name === master.getProfile() ? chalk.green(' [ACTIVE]') : '';
              console.log(`  ${chalk.bold(p.label.padEnd(8))} ${p.description}${active}`);
            }
            console.log();
            break;
          }

          case 'quit':
          case 'exit': {
            await master.shutdown();
            rl.close();
            process.exit(0);
          }

          case 'help': {
            console.log(`
${chalk.bold('Commands:')}
  ${chalk.cyan('spawn')} <ag|claude> [...args]  Spawn a new CLI worker
  ${chalk.cyan('list')}                         List active workers with stats
  ${chalk.cyan('kill')} <worker-id>             Terminate a worker
  ${chalk.cyan('send')} <worker-id> <text>      Send raw input to a worker
  ${chalk.cyan('approve')} <worker-id>          Send 'y' to a waiting worker
  ${chalk.cyan('reject')} <worker-id>           Send 'n' to a waiting worker
  ${chalk.cyan('profile')} [name]               Show/set operation profile
  ${chalk.cyan('profiles')}                     List all available profiles
  ${chalk.cyan('stats')}                        Show aggregate session statistics
  ${chalk.cyan('history')}                      Show recent session history
  ${chalk.cyan('help')}                         Show this help
  ${chalk.cyan('quit')}                         Shutdown and exit
`);
            break;
          }

          default:
            if (cmd) console.log(chalk.red(`Unknown command: ${cmd}. Type 'help' for commands.`));
            break;
        }
      } catch (err: any) {
        console.log(chalk.red(`Error: ${err.message}`));
      }

      rl.prompt();
    });

    rl.on('close', async () => {
      await master.shutdown();
      process.exit(0);
    });
  });

program
  .command('dashboard')
  .description('Launch the C2-style TUI dashboard')
  .option('-w, --workspace <path>', 'mcp2agy workspace path')
  .option('-s, --sessions <path>', 'Session logs directory')
  .option('-m, --max-workers <n>', 'Maximum concurrent workers')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --profile <name>', 'Operation profile (safe|audit|ctf|recon|paranoid)')
  .option('--no-auto-approve', 'Disable automatic prompt approval')
  .option('--no-log', 'Disable session file logging')
  .action(async (opts) => {
    const config = await loadConfig(opts.config);
    const merged = mergeConfigWithFlags(config, {
      workspacePath: opts.workspace,
      sessionsPath: opts.sessions,
      maxWorkers: opts.maxWorkers ? parseInt(opts.maxWorkers, 10) : undefined,
      autoApprove: opts.autoApprove,
      logToFile: opts.log,
    } as any);

    const profile = resolveProfile(opts.profile, merged.profile);

    const master = new MasterOrchestrator({
      workspacePath: path.resolve(merged.workspacePath),
      sessionsPath: path.resolve(merged.sessionsPath),
      maxWorkers: merged.maxWorkers,
      autoApprove: merged.autoApprove,
      logToFile: merged.logToFile,
      profile,
      config: merged,
    });

    await master.start();

    const { Dashboard } = await import('./dashboard.js');
    const dashboard = new Dashboard(master);
    dashboard.start();

    process.on('SIGINT', async () => {
      dashboard.destroy();
      await master.shutdown();
      process.exit(0);
    });
  });

program
  .command('run <target>')
  .description('Run a single CLI worker (ag or claude) with auto-approve, exit when done')
  .argument('[args...]', 'Arguments to pass to the CLI')
  .option('-w, --workspace <path>', 'mcp2agy workspace path')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --profile <name>', 'Operation profile (safe|audit|ctf|recon|paranoid)')
  .option('--no-auto-approve', 'Disable automatic prompt approval')
  .option('--no-log', 'Disable session file logging')
  .action(async (target: string, args: string[], opts) => {
    if (target !== 'ag' && target !== 'claude') {
      console.error(chalk.red('Target must be "ag" or "claude"'));
      process.exit(1);
    }

    const config = await loadConfig(opts.config);
    const merged = mergeConfigWithFlags(config, {
      workspacePath: opts.workspace,
      maxWorkers: 1,
      autoApprove: opts.autoApprove,
      logToFile: opts.log,
    } as any);

    const profile = resolveProfile(opts.profile, merged.profile);

    const master = new MasterOrchestrator({
      workspacePath: path.resolve(merged.workspacePath),
      sessionsPath: path.resolve(merged.sessionsPath),
      maxWorkers: 1,
      autoApprove: merged.autoApprove,
      logToFile: merged.logToFile,
      profile,
      config: merged,
    });

    await master.start();

    process.on('SIGINT', async () => {
      await master.shutdown();
      process.exit(0);
    });

    const worker = await master.spawnWorker(target as CliTarget, args);

    worker.status$.subscribe((status) => {
      if (status === 'terminated') {
        master.shutdown().then(() => process.exit(0));
      }
    });
  });

program
  .command('config')
  .description('Show resolved configuration')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (opts) => {
    const config = await loadConfig(opts.config);
    console.log(JSON.stringify(config, null, 2));
  });

program
  .command('init-config')
  .description('Generate a default ops4agy.config.json in the current directory')
  .action(async () => {
    const fs = await import('fs/promises');
    const defaultConfig = {
      workspacePath: './mcp2agy_workspace',
      sessionsPath: './ops4agy_sessions',
      maxWorkers: 4,
      autoApprove: true,
      logToFile: true,
      profile: 'audit',
      bufferWindowMs: 150,
      injectDelayMin: 100,
      injectDelayMax: 300,
      antiHallucination: {
        enabled: true,
        maxPromptFrequencyMs: 500,
        duplicateWindow: 3000,
      },
      ptyOptions: { cols: 200, rows: 50 },
      customRules: [],
    };
    await fs.writeFile('ops4agy.config.json', JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log(chalk.green('Created ops4agy.config.json'));
  });

program.parse();
