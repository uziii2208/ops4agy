import type { PromptRule, Config } from './types.js';

const SAFE_RULES: PromptRule[] = [
  // Claude Code — tool call approval
  {
    name: 'claude-tool-approval',
    pattern: /Do you want to proceed\?.*\[Y\/n\]/is,
    safe: true,
    response: 'y\r',
    category: 'tool_approval',
  },
  {
    name: 'claude-allow-tool',
    pattern: /Allow (?:once|always)/i,
    safe: true,
    response: '\r',
    category: 'tool_approval',
  },
  // Claude Code — safe bash commands
  {
    name: 'claude-bash-read-only',
    pattern: /Run (?:cat|ls|head|tail|find|grep|rg|wc|file|stat|echo|pwd|whoami|which|type|readlink|env|printenv|hostname|uname|date|id|groups|df|du|uptime|free|ps|top|lsof|netstat|ss|ip|ifconfig|dig|nslookup|host|ping|traceroute|curl\s+(?:-s\s+)?(?:https?:\/\/)|wget\s+(?:--spider|--no-check-certificate\s+)?(?:https?:\/\/)|tree|less|more|sort|uniq|cut|tr|tee|xargs|basename|dirname|realpath|sha256sum|md5sum|diff|comm|test|npm\s+(?:ls|list|info|view|outdated|audit)|git\s+(?:status|log|diff|show|branch|tag|remote|rev-parse|ls-files|blame|shortlog|describe|stash\s+list))\b/i,
    safe: true,
    response: 'y\r',
    category: 'bash_command',
  },
  // Claude Code — press enter / continue
  {
    name: 'claude-press-enter',
    pattern: /Press Enter to continue/i,
    safe: true,
    response: '\r',
    category: 'continuation',
  },
  {
    name: 'claude-continue-conversation',
    pattern: /Press.*to continue|Would you like to continue\?/i,
    safe: true,
    response: '\r',
    category: 'continuation',
  },
  // Claude Code — Read/Write/Edit/Glob/Grep tool approvals
  {
    name: 'claude-file-tool',
    pattern: /(?:Read|Glob|Grep|Edit|Write)(?:\s+\S+)?\s*\n.*(?:\[Y\/n\]|Allow)/is,
    safe: true,
    response: 'y\r',
    category: 'tool_approval',
  },
  // AGY — tool call approval
  {
    name: 'agy-tool-call-approve',
    pattern: /Approve tool call\?.*\[Y\/n\]/is,
    safe: true,
    response: 'y\r',
    category: 'tool_approval',
  },
  {
    name: 'agy-continue-prompt',
    pattern: /Press (?:Enter|any key) to continue/i,
    safe: true,
    response: '\r',
    category: 'continuation',
  },
  {
    name: 'agy-mcp-tool-call',
    pattern: /(?:mcp|MCP)\s+tool\s+call.*\[Y\/n\]/is,
    safe: true,
    response: 'y\r',
    category: 'tool_approval',
  },
  // Generic prompts
  {
    name: 'generic-yn-prompt',
    pattern: /\[Y\/n\]\s*$/m,
    safe: true,
    response: 'y\r',
    category: 'generic',
  },
  {
    name: 'generic-yes-no',
    pattern: /\(yes\/no\)\s*[>:?\s]*$/m,
    safe: true,
    response: 'yes\r',
    category: 'generic',
  },
  {
    name: 'generic-confirm',
    pattern: /(?:Confirm|Proceed|Continue)\??\s*\[?[Yy](?:\/[Nn])?\]?\s*$/m,
    safe: true,
    response: 'y\r',
    category: 'generic',
  },
];

const DANGEROUS_RULES: PromptRule[] = [
  {
    name: 'destructive-rm',
    pattern: /Run (?:rm|del|rmdir|shred|Remove-Item)\b/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
  {
    name: 'destructive-git-force',
    pattern: /Run git (?:push\s+--force|push\s+-f|reset\s+--hard|clean\s+-f|checkout\s+--\s|branch\s+-D)/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
  {
    name: 'destructive-sql',
    pattern: /(?:DROP|TRUNCATE|DELETE\s+FROM)\s+(?:TABLE|DATABASE|SCHEMA)/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
  {
    name: 'destructive-chmod-777',
    pattern: /chmod\s+(?:777|a\+rwx)/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
  {
    name: 'network-pipe-shell',
    pattern: /(?:curl|wget)\s.*\|\s*(?:bash|sh|sudo|powershell|cmd)/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
  {
    name: 'destructive-format',
    pattern: /(?:format|mkfs|diskpart|fdisk)\s/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
  {
    name: 'destructive-kill-process',
    pattern: /Run (?:kill\s+-9|pkill|killall|taskkill\s+\/F|Stop-Process\s+-Force)\b/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
  {
    name: 'destructive-env-overwrite',
    pattern: /Run (?:env|export|set)\s+(?:PATH|HOME|USER|SHELL)=/i,
    safe: false,
    response: '',
    category: 'destructive',
  },
];

export function buildRules(config?: Config): PromptRule[] {
  const customRules: PromptRule[] = (config?.customRules ?? []).map((r) => ({
    name: r.name,
    pattern: new RegExp(r.pattern, r.flags),
    safe: r.safe,
    response: r.response,
    category: r.category,
  }));

  return [...customRules, ...DANGEROUS_RULES, ...SAFE_RULES];
}

export function matchPrompt(text: string, rules: PromptRule[]): PromptRule | null {
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      return rule;
    }
  }
  return null;
}
