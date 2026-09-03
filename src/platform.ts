import os from 'os';
import type { PlatformInfo } from './types.js';

export function detectPlatform(): PlatformInfo {
  const p = os.platform();
  const isWindows = p === 'win32';

  let osName: PlatformInfo['os'] = 'unknown';
  if (isWindows) osName = 'windows';
  else if (p === 'linux') osName = 'linux';
  else if (p === 'darwin') osName = 'darwin';

  const shell = isWindows
    ? 'powershell.exe'
    : (process.env.SHELL || '/bin/bash');

  const quoteWin = (a: string) => a.includes(' ') ? `"${a}"` : a;
  const quoteUnix = (a: string) => a.includes(' ') || a.includes("'") ? `"${a.replace(/"/g, '\\"')}"` : a;

  const shellArgs = isWindows
    ? (cmd: string, args: string[]) => ['-NoProfile', '-NoLogo', '-Command', [cmd, ...args.map(quoteWin)].join(' ')]
    : (cmd: string, args: string[]) => ['-c', [cmd, ...args.map(quoteUnix)].join(' ')];

  return {
    os: osName,
    shell,
    shellArgs,
    pathSeparator: isWindows ? '\\' : '/',
    isWindows,
  };
}
