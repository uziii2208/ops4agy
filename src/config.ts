import fs from 'fs/promises';
import path from 'path';
import { ConfigSchema, type Config } from './types.js';

const CONFIG_FILENAMES = ['ops4agy.config.json', '.ops4agyrc.json'];

export async function loadConfig(explicitPath?: string): Promise<Config> {
  if (explicitPath) {
    const raw = await fs.readFile(path.resolve(explicitPath), 'utf-8');
    return ConfigSchema.parse(JSON.parse(raw));
  }

  for (const name of CONFIG_FILENAMES) {
    const fullPath = path.resolve(process.cwd(), name);
    try {
      const raw = await fs.readFile(fullPath, 'utf-8');
      return ConfigSchema.parse(JSON.parse(raw));
    } catch {
      // not found, try next
    }
  }

  return ConfigSchema.parse({});
}

export function mergeConfigWithFlags(
  config: Config,
  flags: Partial<Config>,
): Config {
  return ConfigSchema.parse({ ...config, ...stripUndefined(flags) });
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}
