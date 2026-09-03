import type { ProfileDefinition, ProfileName } from './types.js';

export const PROFILES: Record<ProfileName, ProfileDefinition> = {
  safe: {
    name: 'safe',
    label: 'SAFE',
    description: 'Read-only commands only. All writes/bash blocked for human review.',
    autoApproveAll: false,
    bashAutoApprove: false,
    toolAutoApprove: true,
    destructiveAutoApprove: false,
    blockedPatterns: [],
  },

  audit: {
    name: 'audit',
    label: 'AUDIT',
    description: 'Security audit mode. MCP tools + read-only bash auto-approved. Destructive ops blocked.',
    autoApproveAll: false,
    bashAutoApprove: true,
    toolAutoApprove: true,
    destructiveAutoApprove: false,
    blockedPatterns: [],
  },

  ctf: {
    name: 'ctf',
    label: 'CTF/BOX',
    description: 'CTF/HackTheBox mode. ALL bash commands auto-approved including exploits. Full YOLO.',
    autoApproveAll: true,
    bashAutoApprove: true,
    toolAutoApprove: true,
    destructiveAutoApprove: true,
    blockedPatterns: ['destructive-format'],
  },

  recon: {
    name: 'recon',
    label: 'RECON',
    description: 'Reconnaissance mode. Network/recon tools auto-approved. Write ops blocked.',
    autoApproveAll: false,
    bashAutoApprove: true,
    toolAutoApprove: true,
    destructiveAutoApprove: false,
    blockedPatterns: [],
  },

  paranoid: {
    name: 'paranoid',
    label: 'PARANOID',
    description: 'Nothing auto-approved. Every single prompt requires manual confirmation.',
    autoApproveAll: false,
    bashAutoApprove: false,
    toolAutoApprove: false,
    destructiveAutoApprove: false,
    blockedPatterns: [],
  },
};

export function getProfile(name: ProfileName): ProfileDefinition {
  return PROFILES[name];
}

export function listProfiles(): ProfileDefinition[] {
  return Object.values(PROFILES);
}

export function shouldAutoApprove(
  profile: ProfileDefinition,
  category: string,
  ruleName: string,
  isSafe: boolean,
): boolean {
  if (profile.blockedPatterns.includes(ruleName)) return false;
  if (profile.autoApproveAll) return true;
  if (!isSafe) return profile.destructiveAutoApprove;

  switch (category) {
    case 'tool_approval':
      return profile.toolAutoApprove;
    case 'bash_command':
      return profile.bashAutoApprove;
    case 'continuation':
      return true;
    case 'generic':
      return profile.toolAutoApprove;
    case 'destructive':
      return profile.destructiveAutoApprove;
    default:
      return false;
  }
}
