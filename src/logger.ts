import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export class Logger {
  private logFile: fs.FileHandle | null = null;
  private readonly sessionsDir: string;
  silent = false;

  constructor(sessionsDir: string) {
    this.sessionsDir = path.resolve(sessionsDir);
  }

  async initSessionLog(sessionId: string): Promise<string> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    const logPath = path.join(this.sessionsDir, `${sessionId}.log`);
    this.logFile = await fs.open(logPath, 'a');
    return logPath;
  }

  async writeLog(source: string, message: string): Promise<void> {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${source}] ${message}\n`;
    if (this.logFile) {
      await this.logFile.write(line);
    }
  }

  info(source: string, message: string): void {
    if (!this.silent) {
      const ts = new Date().toISOString().slice(11, 23);
      console.log(`${chalk.gray(ts)} ${chalk.bold(`[${source}]`)} ${message}`);
    }
    this.writeLog(source, message).catch(() => {});
  }

  warn(source: string, message: string): void {
    if (!this.silent) {
      const ts = new Date().toISOString().slice(11, 23);
      console.log(`${chalk.gray(ts)} ${chalk.bold(`[${source}]`)} ${chalk.yellow(message)}`);
    }
    this.writeLog(source, `WARN: ${message}`).catch(() => {});
  }

  error(source: string, message: string): void {
    if (!this.silent) {
      const ts = new Date().toISOString().slice(11, 23);
      console.log(`${chalk.gray(ts)} ${chalk.bold(`[${source}]`)} ${chalk.red(message)}`);
    }
    this.writeLog(source, `ERROR: ${message}`).catch(() => {});
  }

  alert(source: string, message: string): void {
    if (!this.silent) {
      const ts = new Date().toISOString().slice(11, 23);
      console.log(`${chalk.gray(ts)} ${chalk.bold.red(`[${source}]`)} ${chalk.red.bold(message)}`);
    }
    this.writeLog(source, `ALERT: ${message}`).catch(() => {});
  }

  async close(): Promise<void> {
    if (this.logFile) {
      await this.logFile.close();
      this.logFile = null;
    }
  }
}
