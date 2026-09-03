import { z } from 'zod';

export const CliTargetSchema = z.enum(['ag', 'claude']);
export type CliTarget = z.infer<typeof CliTargetSchema>;

export const ProfileNameSchema = z.enum(['safe', 'audit', 'ctf', 'recon', 'paranoid']);
export type ProfileName = z.infer<typeof ProfileNameSchema>;

export type WorkerStatus =
  | 'idle'
  | 'running'
  | 'waiting_prompt'
  | 'waiting_human'
  | 'terminated'
  | 'error';

export type WorkerEventType =
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'OUTPUT'
  | 'PROMPT_DETECTED'
  | 'AUTO_APPROVED'
  | 'MANUAL_INTERVENTION_REQUIRED'
  | 'ANTI_HALLUCINATION_TRIGGERED'
  | 'ERROR';

export interface WorkerEvent {
  type: WorkerEventType;
  workerId: string;
  timestamp: number;
  seq: number;
  data?: Record<string, unknown>;
}

export interface PromptMatch {
  pattern: string;
  matched: string;
  safe: boolean;
  category: 'tool_approval' | 'bash_command' | 'continuation' | 'generic' | 'destructive';
}

export interface WorkerOptions {
  id: string;
  target: CliTarget;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  autoApprove: boolean;
  logToFile: boolean;
  profile: ProfileName;
}

export const ConfigSchema = z.object({
  workspacePath: z.string().default('./mcp2agy_workspace'),
  sessionsPath: z.string().default('./ops4agy_sessions'),
  maxWorkers: z.number().min(1).max(16).default(4),
  autoApprove: z.boolean().default(true),
  logToFile: z.boolean().default(true),
  profile: ProfileNameSchema.default('audit'),
  bufferWindowMs: z.number().min(50).max(1000).default(150),
  injectDelayMin: z.number().min(0).max(2000).default(100),
  injectDelayMax: z.number().min(0).max(5000).default(300),
  antiHallucination: z.object({
    enabled: z.boolean().default(true),
    maxPromptFrequencyMs: z.number().default(500),
    duplicateWindow: z.number().default(3000),
  }).default({}),
  ptyOptions: z.object({
    cols: z.number().default(200),
    rows: z.number().default(50),
  }).default({}),
  customRules: z.array(z.object({
    name: z.string(),
    pattern: z.string(),
    flags: z.string().default('i'),
    safe: z.boolean(),
    response: z.string(),
    category: z.enum(['tool_approval', 'bash_command', 'continuation', 'generic', 'destructive']).default('generic'),
  })).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface MasterOptions {
  workspacePath: string;
  sessionsPath: string;
  maxWorkers: number;
  autoApprove: boolean;
  logToFile: boolean;
  profile: ProfileName;
  config: Config;
}

export interface PromptRule {
  name: string;
  pattern: RegExp;
  safe: boolean;
  response: string;
  category: PromptMatch['category'];
}

export interface ProfileDefinition {
  name: ProfileName;
  label: string;
  description: string;
  autoApproveAll: boolean;
  bashAutoApprove: boolean;
  toolAutoApprove: boolean;
  destructiveAutoApprove: boolean;
  blockedPatterns: string[];
}

export interface SessionRecord {
  id: string;
  target: CliTarget;
  profile: ProfileName;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  promptsDetected: number;
  promptsAutoApproved: number;
  promptsBlocked: number;
  antiHallucinationEvents: number;
  logFile?: string;
}

export interface PlatformInfo {
  os: 'windows' | 'linux' | 'darwin' | 'unknown';
  shell: string;
  shellArgs: (cmd: string, args: string[]) => string[];
  pathSeparator: string;
  isWindows: boolean;
}
