# ops4agy Usage Guide

## Overview

ops4agy wraps AGY and Claude Code CLI processes in pseudo-terminals (PTY), intercepts their stdout in real-time, and automatically responds to approval prompts. This eliminates the need to manually approve every tool call while still blocking dangerous commands for human review.

## How It Works

```
CLI Process (PTY)
    │
    ▼ stdout chunks
ANSI Strip (strip-ansi)
    │
    ▼ plain text buffer (150ms window)
Prompt Detection (regex rule engine)
    │
    ├── Anti-Hallucination Guard
    │       ├── Duplicate loop? ──────► BLOCK → manual review
    │       ├── Abnormal frequency? ──► BLOCK → manual review
    │       └── Too short match? ─────► BLOCK → manual review
    │
    ├── Profile-based auto-approve check
    │       ├── Profile allows? ──────► Auto-inject response (100-300ms delay)
    │       │                                 └── EVENT: AUTO_APPROVED
    │       └── Profile blocks? ─────► Hold for human input
    │                                        └── EVENT: MANUAL_INTERVENTION_REQUIRED
    │
    └── Dangerous rule matched ──────► Always hold for human input
                                             └── EVENT: MANUAL_INTERVENTION_REQUIRED
```

## Setup

### Install & Build

```bash
cd ops4agy
npm install
npm run build
```

### Verify CLI Tools

```bash
# Check AGY
ag --version

# Check Claude Code
claude --version
```

## Configuration

ops4agy supports three layers of configuration (highest priority first):

1. **CLI flags** (e.g., `--max-workers 8`, `--profile ctf`)
2. **Config file** (`ops4agy.config.json` or `.ops4agyrc.json`)
3. **Built-in defaults**

### Generate Default Config

```bash
node dist/index.js init-config
```

This creates `ops4agy.config.json`:

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

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workspacePath` | string | `./mcp2agy_workspace` | mcp2agy workspace directory |
| `sessionsPath` | string | `./ops4agy_sessions` | Session logs directory |
| `maxWorkers` | number | `4` | Maximum concurrent workers (1-16) |
| `autoApprove` | boolean | `true` | Auto-approve safe prompts |
| `logToFile` | boolean | `true` | Log session output to files |
| `profile` | string | `audit` | Default operation profile |
| `bufferWindowMs` | number | `150` | Buffer window before evaluating for prompts (ms) |
| `injectDelayMin` | number | `100` | Minimum delay before auto-inject (ms) |
| `injectDelayMax` | number | `300` | Maximum delay before auto-inject (ms) |
| `antiHallucination.enabled` | boolean | `true` | Enable anti-hallucination guard |
| `antiHallucination.maxPromptFrequencyMs` | number | `500` | Minimum interval between prompts |
| `antiHallucination.duplicateWindow` | number | `3000` | Duplicate detection window (ms) |
| `ptyOptions.cols` | number | `200` | PTY terminal columns |
| `ptyOptions.rows` | number | `50` | PTY terminal rows |
| `customRules` | array | `[]` | Custom prompt detection rules |

### Custom Rules

Add rules without modifying source code:

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

Custom rules are evaluated **first** (before built-in rules). Categories: `tool_approval`, `bash_command`, `continuation`, `generic`, `destructive`.

## Operation Profiles

Profiles control which prompt categories are auto-approved. Switch at any time via REPL command or dashboard menu.

| Profile | Bash | Tools | Destructive | Use Case |
|---------|------|-------|-------------|----------|
| **SAFE** | Block | Auto | Block | Read-only analysis, code review |
| **AUDIT** | Auto | Auto | Block | Security audits with mcp2agy |
| **CTF** | Auto | Auto | Auto | CTF boxes and HackTheBox (full YOLO, except format) |
| **RECON** | Auto | Auto | Block | Network reconnaissance and enumeration |
| **PARANOID** | Block | Block | Block | Untrusted environments, every prompt manual |

### Set via CLI

```bash
node dist/index.js start --profile ctf
node dist/index.js dashboard --profile paranoid
node dist/index.js run claude --profile audit -- "scan the codebase"
```

### Switch at Runtime

REPL mode:
```
ops4agy> profile ctf
Profile set to: CTF
ops4agy> profiles
  Available Profiles:
  SAFE     Read-only commands only...
  AUDIT    Security audit mode... [ACTIVE]
  CTF      CTF/HackTheBox mode...
  RECON    Reconnaissance mode...
  PARANOID Nothing auto-approved...
```

Dashboard mode: press `Ctrl+P` for the profile switcher menu.

## Usage Modes

### Mode 1: TUI Dashboard (Recommended)

```bash
node dist/index.js dashboard
node dist/index.js dashboard --profile ctf --max-workers 8
```

The dashboard provides a C2 operator-style terminal UI:

- **Left panel (25%)** - worker list with status indicators
- **Right panel (75%)** - live output from selected worker
- **Bottom panel (35%)** - event log stream
- **Status bar** - profile, worker count, stats at a glance
- **Input bar** - type commands directly

Keyboard shortcuts:

| Key | Action |
|-----|--------|
| `Ctrl+N` | Spawn new worker (dialog) |
| `Ctrl+D` | Kill selected worker |
| `Ctrl+A` | Approve selected worker (send `y`) |
| `Ctrl+R` | Reject selected worker (send `n`) |
| `Ctrl+P` | Profile switcher menu |
| `Ctrl+S` | Settings toggle menu |
| `Tab` | Cycle focus between panels |
| `F1` | Help overlay |
| `Ctrl+C` | Exit |

### Mode 2: Interactive REPL (Multi-Worker)

```bash
node dist/index.js start --workspace ./mcp2agy_workspace --max-workers 4
```

Opens an interactive REPL:

```
ops4agy> spawn claude "review the auth module for vulnerabilities"
[12:34:56.789] [claude-1] Session started (pid: 12345, target: claude, profile: AUDIT)

ops4agy> spawn ag --scan target-app.com
[12:34:58.123] [ag-2] Session started (pid: 12346, target: ag, profile: AUDIT)

ops4agy> list
  Active Workers:
  claude-1 running | prompts: 5 auto: 5 blocked: 0 ah: 0
  ag-2 waiting_human | prompts: 3 auto: 2 blocked: 1 ah: 0

ops4agy> approve ag-2
Approved ag-2

ops4agy> stats
  Session Statistics:
  Total sessions:       4
  Active sessions:      2
  Prompts detected:     15
  Auto-approved:        13
  Blocked:              2
  Anti-hallucination:   0
  Current profile:      AUDIT

ops4agy> history
  Recent Sessions:
  claude-1 [claude/audit] active started: 2024-01-15T12:34:56 prompts: 5/5/0 ah: 0
  ag-2 [ag/audit] active started: 2024-01-15T12:34:58 prompts: 3/2/1 ah: 0

ops4agy> quit
```

### Mode 3: Single Worker (Fire-and-Forget)

```bash
# Run Claude with auto-approve in audit mode
node dist/index.js run claude --profile audit -- "scan this repo for security issues"

# Run AGY in CTF mode
node dist/index.js run ag --profile ctf -- --deep-scan

# Run with auto-approve disabled
node dist/index.js run ag --no-auto-approve -- --scan example.com
```

The process exits automatically when the CLI session ends.

## Anti-Hallucination Guard

The guard validates every prompt match before auto-approving. It catches three classes of false positives:

### Duplicate Detection
If the same prompt hash appears >2 times within the `duplicateWindow` (default 3s), the guard blocks. This catches LLM output loops where the same approval text is generated repeatedly.

### Frequency Analysis
If >3 prompts fire within `maxPromptFrequencyMs` (default 500ms), the guard blocks. Real CLI prompts don't arrive at machine-gun speed - abnormal frequency usually means the regex is matching non-prompt output.

### Short Match Validation
Matches shorter than 5 characters are blocked as likely false positives. A real prompt contains more context than just "y" or "ok".

### When Triggered

```
[12:45:00.000] [claude-1] ANTI-HALLUCINATION: Duplicate prompt detected 3x in 3000ms
[12:45:00.001] [claude-1] MANUAL INTERVENTION REQUIRED
[12:45:00.002] [claude-1] Reason: anti-hallucination: Duplicate prompt detected 3x...
```

The prompt is held for manual review. In the dashboard, `Ctrl+A` to approve or `Ctrl+R` to reject.

## Worker States

| Status | Meaning |
|--------|---------|
| `idle` | Worker created but not started |
| `running` | CLI process is active |
| `waiting_prompt` | Safe prompt detected, auto-approving shortly |
| `waiting_human` | Dangerous/blocked prompt detected, waiting for manual input |
| `terminated` | CLI process has exited |
| `error` | Worker encountered an error |

## Working with mcp2agy

ops4agy watches `mcp2agy_workspace/` for file changes. When the mcp2agy MCP server writes artifacts (scan results, reports, etc.), ops4agy detects and logs these changes, preventing race conditions between workers.

```bash
# Point to your mcp2agy workspace
node dist/index.js dashboard --workspace D:\mcp2agy\mcp2agy_workspace
```

### Run a Security Audit Pipeline

```bash
node dist/index.js dashboard -w D:\mcp2agy\mcp2agy_workspace --profile audit

# In the dashboard, press Ctrl+N to spawn:
# target: claude
# Then the worker runs: "run /mcp2agy-scan on the target codebase, then /mcp2agy-verify all findings"
```

### Run Multiple Claude Sessions in Parallel

```bash
node dist/index.js dashboard --max-workers 3

# Press Ctrl+N three times to spawn:
# claude "analyze src/auth for injection vulnerabilities"
# claude "review src/api for broken access control"
# claude "check src/crypto for weak algorithms"
```

## Session Logging

When `logToFile` is enabled (default), every worker session logs to `ops4agy_sessions/`:

```
ops4agy_sessions/
  index.json           # Session records (id, target, profile, timestamps, prompt counts, ah events)
  claude-1.log         # Full ANSI-stripped session output
  ag-2.log             # Full ANSI-stripped session output
```

The `index.json` persists across daemon restarts, so `stats` and `history` reflect all sessions.

## Manual Override

When a worker hits a dangerous prompt or anti-hallucination block:

```
[12:45:00.000] [claude-1] MANUAL INTERVENTION REQUIRED
[12:45:00.001] [claude-1] Reason: dangerous pattern: destructive-rm
[12:45:00.002] [claude-1] Context: Run rm -rf ./temp_build (Y/n)
```

Your options:

REPL mode:
```
ops4agy> approve claude-1    # Send 'y' - allow the command
ops4agy> reject claude-1     # Send 'n' - deny the command
ops4agy> send claude-1 skip  # Send custom input
```

Dashboard mode:
- Select the worker in the left panel
- `Ctrl+A` to approve, `Ctrl+R` to reject
- Type in the input bar and press Enter to send custom input

## Troubleshooting

### Worker spawns but immediately terminates
- Check that the CLI tool (`ag` or `claude`) is on your PATH
- Try running the command directly: `ag --version` or `claude --version`

### Auto-approve not triggering
- The prompt text may contain ANSI codes that don't match after stripping
- Increase `bufferWindowMs` in config if prompts are arriving in multiple chunks
- Add a custom rule in `ops4agy.config.json` for your specific prompt format
- Check your profile - `paranoid` blocks everything, `safe` blocks bash

### Anti-hallucination blocking legitimate prompts
- If prompts arrive quickly (e.g., batch tool calls), increase `maxPromptFrequencyMs`
- If the same prompt legitimately repeats, increase `duplicateWindow`
- Disable entirely: `"antiHallucination": { "enabled": false }`

### node-pty build fails on Windows
- Install Visual Studio Build Tools with "Desktop development with C++" workload
- Or: `npm install --global windows-build-tools`

### Config not loading
- Run `node dist/index.js config` to see the resolved configuration
- Config file must be `ops4agy.config.json` or `.ops4agyrc.json` in the current directory
- Or pass explicitly: `--config /path/to/config.json`
