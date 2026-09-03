import type { Config } from './types.js';

interface PromptEvent {
  ruleName: string;
  timestamp: number;
  hash: string;
}

export class AntiHallucinationGuard {
  private readonly enabled: boolean;
  private readonly maxFrequencyMs: number;
  private readonly duplicateWindow: number;
  private readonly recentPrompts: PromptEvent[] = [];
  private eventCount = 0;

  constructor(config: Config) {
    this.enabled = config.antiHallucination.enabled;
    this.maxFrequencyMs = config.antiHallucination.maxPromptFrequencyMs;
    this.duplicateWindow = config.antiHallucination.duplicateWindow;
  }

  validate(ruleName: string, matchedText: string): { valid: boolean; reason?: string } {
    if (!this.enabled) return { valid: true };

    const now = Date.now();
    const hash = this.simpleHash(matchedText);

    this.recentPrompts.push({ ruleName, timestamp: now, hash });
    while (this.recentPrompts.length > 0 && now - this.recentPrompts[0].timestamp > 10000) {
      this.recentPrompts.shift();
    }
    this.eventCount++;

    const recentSame = this.recentPrompts.filter(
      (p) => p.hash === hash && now - p.timestamp < this.duplicateWindow,
    );
    if (recentSame.length > 2) {
      return {
        valid: false,
        reason: `Duplicate prompt detected ${recentSame.length}x in ${this.duplicateWindow}ms — possible prompt injection or loop`,
      };
    }

    const recentAll = this.recentPrompts.filter(
      (p) => now - p.timestamp < this.maxFrequencyMs,
    );
    if (recentAll.length > 3) {
      return {
        valid: false,
        reason: `Abnormal prompt frequency: ${recentAll.length} prompts in ${this.maxFrequencyMs}ms — holding for human review`,
      };
    }

    if (matchedText.length < 5) {
      return {
        valid: false,
        reason: `Suspiciously short prompt match (${matchedText.length} chars) — possible false positive`,
      };
    }

    return { valid: true };
  }

  getStats(): { totalEvents: number; recentWindowSize: number } {
    return {
      totalEvents: this.eventCount,
      recentWindowSize: this.recentPrompts.length,
    };
  }

  private simpleHash(text: string): string {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return h.toString(36);
  }
}
