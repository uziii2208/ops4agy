<p align="center">
  <img src="photos/logo.png" alt="ops4agy" width="600">
</p>

<p align="center">
  <strong>Autonomous Master-Worker Daemon for AGY & Claude Code CLI Orchestration</strong>
</p>

<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="#operation-profiles"><img src="https://img.shields.io/badge/profiles-5%20modes-orange?style=flat-square" alt="Profiles"></a>
  <a href="https://github.com/uziii2208/mcp2agy"><img src="https://img.shields.io/badge/works%20with-mcp2agy-purple?style=flat-square" alt="mcp2agy"></a>
</p>

<p align="center">
  Wraps CLI processes via PTY, detects approval prompts in real-time, and auto-injects keystrokes -<br>
  eliminating the human-in-the-loop bottleneck while keeping dangerous operations gated.
</p>

---

## Features

<table>
<tr>
<td width="50%">

**Orchestration**
- C2-style TUI dashboard (`blessed`)
- Multi-session worker pool management
- RxJS event bus with sequenced ordering
- Session persistence & statistics

</td>
<td width="50%">

**Intelligence**
- Regex prompt detection engine (12 safe / 8 dangerous)
- 5 operation profiles (safe/audit/ctf/recon/paranoid)
- Anti-hallucination guard (duplicate/frequency/length)
- Custom rules via config

</td>
</tr>
<tr>
<td>

**Terminal**
- PTY wrapping with `node-pty`
- ANSI escape code stripping
- Auto-keystroke injection (100-300ms delay)
- Cross-platform (Windows/Linux/macOS)

</td>
<td>

**Integration**
- Built for [mcp2agy](https://github.com/uziii2208/mcp2agy) pipeline
- Workspace file watching (`chokidar`)
- Zod-validated JSON config
- ESM module system (`Node16`)

</td>
</tr>
</table>

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **ag** (Antigravity CLI) and/or **claude** (Claude Code CLI) on PATH
- **Windows**: Visual Studio Build Tools for `node-pty`

### Installation

```bash
git clone https://github.com/uziii2208/ops4agy.git
cd ops4agy
npm install
npm run build
```

### Launch

```bash
# TUI Dashboard (recommended)
node dist/index.js dashboard --profile audit

# Interactive REPL
node dist/index.js start --profile ctf

# Single worker (fire-and-forget)
node dist/index.js run claude --profile audit -- "analyze the auth module"
```

---

## TUI Dashboard

Launch with `node dist/index.js dashboard` for a C2 operator-style terminal interface.

```
┌─ ops4agy ─────────────────────────────────────────────────────────────┐
│  PROFILE: AUDIT │ Workers: 2/4 │ Auto: 13 │ Blocked: 2 │ AH: 0        │
├─ Workers ──────┬─ Output [claude-1] ──────────────────────────────────┤
│                │                                                      │
│ ● claude-1     │  Analyzing src/auth/middleware.ts...                 │
│   running      │  Found 3 potential issues:                           │
│                │  1. Missing input validation on line 42              │
│ ● ag-2         │  2. Hardcoded secret on line 78                      │
│   waiting_human│  3. SQL injection risk on line 156                   │
│                │                                                      │
├────────────────┴─ Event Log ──────────────────────────────────────────┤
│ 12:34:56.789 [claude-1] Auto-approved [tool_approval]: claude-tool    │
│ 12:35:01.234 [ag-2] MANUAL INTERVENTION REQUIRED                      │
│ 12:35:01.235 [ag-2] Reason: dangerous pattern: destructive-rm         │
├───────────────────────────────────────────────────────────────────────┤
│ ops4agy>                                                              │
└───────────────────────────────────────────────────────────────────────┘
```

### Keyboard Shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Ctrl+N` | Spawn new worker | `Ctrl+P` | Profile switcher |
| `Ctrl+D` | Kill selected worker | `Ctrl+S` | Settings menu |
| `Ctrl+A` | Approve (send `y`) | `Tab` | Cycle focus |
| `Ctrl+R` | Reject (send `n`) | `F1` | Help overlay |
| | | `Ctrl+C` | Exit |

---

## Operation Profiles

Switch at runtime via `profile <name>` (REPL) or `Ctrl+P` (dashboard).

| Profile | Bash | Tools | Destructive | Use Case |
|:--------|:----:|:-----:|:-----------:|:---------|
| `safe` | Block | Auto | Block | Read-only analysis, code review |
| `audit` | Auto | Auto | Block | Security audits with mcp2agy |
| `ctf` | Auto | Auto | Auto | CTF / HackTheBox - full YOLO |
| `recon` | Auto | Auto | Block | Network reconnaissance |
| `paranoid` | Block | Block | Block | Zero trust - everything manual |

---

## Anti-Hallucination Guard

Validates every prompt match before auto-approving. Catches three classes of false positives:

| Check | Trigger | Default |
|:------|:--------|:--------|
| **Duplicate detection** | Same prompt hash >2x in window | `3000ms` window |
| **Frequency analysis** | >3 prompts in interval | `500ms` interval |
| **Short match** | Match < 5 characters | Always on |

When triggered, the prompt is held for manual review and logged as `ANTI_HALLUCINATION_TRIGGERED`.

```json
{
  "antiHallucination": {
    "enabled": true,
    "maxPromptFrequencyMs": 500,
    "duplicateWindow": 3000
  }
}
```

---

## Configuration

```bash
node dist/index.js init-config   # Generate default ops4agy.config.json
node dist/index.js config        # Show resolved configuration
```

<details>
<summary><strong>Full config reference</strong></summary>

```json
{
  "workspacePath": "./mcp2agy_workspace",
  "sessionsPath": "./ops4agy_sessions",
  "maxWorkers": 4,
  "autoApprove": true,
  "logToFile": true,
  "profile": "audit",
  "bufferWindowMs": 150,
  "injectDelayMin": 100,
  "injectDelayMax": 300,
  "antiHallucination": {
    "enabled": true,
    "maxPromptFrequencyMs": 500,
    "duplicateWindow": 3000
  },
  "ptyOptions": { "cols": 200, "rows": 50 },
  "customRules": []
}
```

| Option | Type | Default | Description |
|:-------|:-----|:--------|:------------|
| `workspacePath` | `string` | `./mcp2agy_workspace` | Workspace directory |
| `sessionsPath` | `string` | `./ops4agy_sessions` | Session logs directory |
| `maxWorkers` | `number` | `4` | Max concurrent workers (1-16) |
| `autoApprove` | `boolean` | `true` | Auto-approve safe prompts |
| `logToFile` | `boolean` | `true` | Log session output to files |
| `profile` | `string` | `audit` | Default operation profile |
| `bufferWindowMs` | `number` | `150` | Buffer window before prompt eval (ms) |
| `injectDelayMin` | `number` | `100` | Min delay before auto-inject (ms) |
| `injectDelayMax` | `number` | `300` | Max delay before auto-inject (ms) |
| `ptyOptions.cols` | `number` | `200` | PTY terminal columns |
| `ptyOptions.rows` | `number` | `50` | PTY terminal rows |
| `customRules` | `array` | `[]` | Custom prompt detection rules |

</details>

<details>
<summary><strong>Custom rules example</strong></summary>

```json
{
  "customRules": [
    {
      "name": "my-deploy-confirm",
      "pattern": "Deploy to production\\?",
      "flags": "i",
      "safe": false,
      "response": "",
      "category": "destructive"
    },
    {
      "name": "my-test-approve",
      "pattern": "Run test suite\\?",
      "flags": "i",
      "safe": true,
      "response": "y\r",
      "category": "generic"
    }
  ]
}
```

Categories: `tool_approval` | `bash_command` | `continuation` | `generic` | `destructive`

</details>

### CLI Flags

| Flag | Description |
|:-----|:------------|
| `-w, --workspace <path>` | Workspace directory |
| `-s, --sessions <path>` | Session logs directory |
| `-m, --max-workers <n>` | Max concurrent workers |
| `-c, --config <path>` | Config file path |
| `-p, --profile <name>` | Operation profile |
| `--no-auto-approve` | Disable auto-approval |
| `--no-log` | Disable file logging |

---

## REPL Commands

| Command | Description |
|:--------|:------------|
| `spawn <ag\|claude> [...args]` | Spawn a new CLI worker |
| `list` | List active workers with stats |
| `kill <worker-id>` | Terminate a worker |
| `send <worker-id> <text>` | Send raw input to worker stdin |
| `approve <worker-id>` | Send `y` to waiting worker |
| `reject <worker-id>` | Send `n` to waiting worker |
| `profile [name]` | Show/set operation profile |
| `profiles` | List all available profiles |
| `stats` | Aggregate session statistics |
| `history` | Recent session history |
| `help` | Show commands |
| `quit` / `exit` | Shutdown and exit |

---

## Prompt Detection

<details>
<summary><strong>Safe rules (auto-approved)</strong> - 12 rules</summary>

| Category | Rule | Example |
|:---------|:-----|:--------|
| Tool approval | Claude tool approval | `Do you want to proceed? [Y/n]` |
| Tool approval | Claude allow tool | `Allow once/always` |
| Tool approval | Claude file tools | `Read/Glob/Grep/Edit/Write ... [Y/n]` |
| Tool approval | AGY tool call | `Approve tool call? [Y/n]` |
| Tool approval | AGY MCP tool call | `mcp tool call... [Y/n]` |
| Bash command | Read-only bash | `git status/log/diff`, `npm audit`, `curl https` |
| Continuation | Press enter | `Press Enter to continue` |
| Continuation | Continue | `Would you like to continue?` |
| Generic | Y/n prompt | `[Y/n]` at end of line |
| Generic | Yes/No prompt | `(yes/no)` at end of line |
| Generic | Confirm prompt | `Confirm/Proceed/Continue?` |

</details>

<details>
<summary><strong>Dangerous rules (blocked)</strong> - 8 rules</summary>

| Category | Rule | Pattern |
|:---------|:-----|:--------|
| Destructive | Delete files | `rm/del/rmdir/shred/Remove-Item` |
| Destructive | Git force ops | `push --force/reset --hard/clean -f/branch -D` |
| Destructive | SQL destructive | `DROP/TRUNCATE/DELETE FROM` |
| Destructive | Unsafe perms | `chmod 777/a+rwx` |
| Destructive | Pipe to shell | `curl\|bash/sh/sudo` |
| Destructive | Format disk | `format/mkfs/diskpart` |
| Destructive | Kill process | `kill -9/pkill/killall/taskkill /F` |
| Destructive | Env overwrite | `export PATH=/HOME=/USER=` |

</details>

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    MasterOrchestrator                        │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │ Worker 1 │  │ Worker 2 │  │ Worker N │  ← PTY + node-pty  │
│  │ (claude) │  │   (ag)   │  │   (ag)   │                    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                    │
│       └──────────────┼─────────────┘                         │
│                      ▼                                       │
│            ┌─────────────────┐                               │
│            │  Event Bus      │  ← RxJS Subject               │
│            │  (sequenced)    │                               │
│            └────────┬────────┘                               │
│                     ▼                                        │
│  ┌──────────────────────────────────────────┐                │
│  │         Dashboard (blessed TUI)          │                │
│  │  Workers │ Output │ Logs │ Status bar    │                │
│  └──────────────────────────────────────────┘                │
│                                                              │
│  ┌────────────┐ ┌────────────────┐ ┌─────────────────┐       │
│  │  Profiles  │ │ Anti-Halluc.   │ │  Prompt Rules   │       │
│  │  5 modes   │ │ Guard          │ │  12 safe / 8 dng│       │
│  └────────────┘ └────────────────┘ └─────────────────┘       │
│                                                              │
│  ┌────────────┐ ┌────────────────┐ ┌─────────────────┐       │
│  │ Workspace  │ │ Session Store  │ │  Config (Zod)   │       │
│  │ Watcher    │ │ (JSON index)   │ │  ops4agy.config │       │
│  └────────────┘ └────────────────┘ └─────────────────┘       │
│                                                              │
│  ┌────────────┐ ┌────────────────┐                           │
│  │   Logger   │ │   Platform     │                           │
│  │ file+stdout│ │   detector     │                           │
│  └────────────┘ └────────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

### Modules

| Module | File | Role |
|:-------|:-----|:-----|
| `CliWorker` | `src/cli-worker.ts` | PTY spawn, ANSI strip, prompt detect, auto-inject |
| `MasterOrchestrator` | `src/master-orchestrator.ts` | Worker pool, events, sessions, profiles |
| `Dashboard` | `src/dashboard.ts` | C2-style blessed TUI |
| `Profiles` | `src/profiles.ts` | 5 operation mode definitions |
| `AntiHallucinationGuard` | `src/anti-hallucination.ts` | Prompt validation heuristics |
| `PromptRules` | `src/prompt-rules.ts` | Regex rule engine + custom rules |
| `WorkspaceWatcher` | `src/workspace-watcher.ts` | File change monitoring |
| `SessionStore` | `src/session-store.ts` | JSON-persisted session records |
| `Config` | `src/config.ts` | Zod-validated config loader |
| `Logger` | `src/logger.ts` | Dual-output (console + file) |
| `Platform` | `src/platform.ts` | Cross-platform shell detection |
| `Types` | `src/types.ts` | Shared interfaces + Zod schemas |

---

## Session Logging

```
ops4agy_sessions/
  index.json           # Session records (id, target, profile, timestamps, stats)
  claude-1.log         # Full ANSI-stripped output
  ag-2.log             # Full ANSI-stripped output
```

```
ops4agy> stats
  Total sessions:       12
  Active sessions:      2
  Prompts detected:     47
  Auto-approved:        41
  Blocked:              6
  Anti-hallucination:   2
  Current profile:      AUDIT
```

---

## Working with mcp2agy

```bash
# Point to mcp2agy workspace
node dist/index.js dashboard --workspace D:\mcp2agy\mcp2agy_workspace --profile audit

# Spawn workers for parallel security analysis
# Ctrl+N → claude → "run /mcp2agy-scan on the target codebase"
# Ctrl+N → claude → "verify all findings from the scan"
# Ctrl+N → claude → "generate remediation patches"
```

---

## Troubleshooting

<details>
<summary>Worker spawns but immediately terminates</summary>

Check that the CLI tool is on PATH: `ag --version` or `claude --version`
</details>

<details>
<summary>Auto-approve not triggering</summary>

- Increase `bufferWindowMs` if prompts arrive in multiple chunks
- Check your profile - `paranoid` blocks everything, `safe` blocks bash
- Add a custom rule for your specific prompt format
</details>

<details>
<summary>Anti-hallucination blocking legitimate prompts</summary>

- Batch tool calls: increase `maxPromptFrequencyMs`
- Repeated prompts: increase `duplicateWindow`
- Disable: `"antiHallucination": { "enabled": false }`
</details>

<details>
<summary>node-pty build fails on Windows</summary>

Install Visual Studio Build Tools with "Desktop development with C++" workload, or `npm install --global windows-build-tools`
</details>

---

<p align="center">
  <sub>Built by <a href="https://github.com/uziii2208">uziii2208</a> - works with <a href="https://github.com/uziii2208/mcp2agy">mcp2agy</a></sub>
</p>
