import { describe, it, expect } from 'vitest';
import {
  computeUsage,
  formatCost,
  formatTokens,
  getModelLabel,
  MODEL_PRICING,
} from '../orchestrator-pricing';

describe('orchestrator-pricing', () => {
  describe('MODEL_PRICING', () => {
    it('has pricing for default Cockpit models', () => {
      expect(MODEL_PRICING['moonshotai/kimi-k2']).toBeDefined();
      expect(MODEL_PRICING['deepseek/deepseek-r1']).toBeDefined();
      expect(MODEL_PRICING['zhipu/glm-4']).toBeDefined();
      expect(MODEL_PRICING['anthropic/claude-opus-4']).toBeDefined();
    });

    it('has pricing for advocate model (deepseek-r1)', () => {
      expect(MODEL_PRICING['deepseek/deepseek-r1']).toBeDefined();
    });

    it('Claude Opus is the most expensive', () => {
      const claude = MODEL_PRICING['anthropic/claude-opus-4'];
      const kimi = MODEL_PRICING['moonshotai/kimi-k2'];
      expect(claude.outputPerMTokens).toBeGreaterThan(kimi.outputPerMTokens);
    });
  });

  describe('computeUsage', () => {
    it('computes usage for known model', () => {
      const usage = computeUsage('moonshotai/kimi-k2', 1000, 500);
      expect(usage.promptTokens).toBe(1000);
      expect(usage.completionTokens).toBe(500);
      expect(usage.totalTokens).toBe(1500);
      expect(usage.costUsd).toBeGreaterThan(0);
    });

    it('Claude Opus costs more than Kimi for same tokens', () => {
      const claude = computeUsage('anthropic/claude-opus-4', 1000, 500);
      const kimi = computeUsage('moonshotai/kimi-k2', 1000, 500);
      expect(claude.costUsd).toBeGreaterThan(kimi.costUsd);
    });

    it('returns 0 cost for unknown model', () => {
      const usage = computeUsage('unknown/model', 1000, 500);
      expect(usage.promptTokens).toBe(1000);
      expect(usage.completionTokens).toBe(500);
      expect(usage.costUsd).toBe(0);
    });

    it('handles zero tokens', () => {
      const usage = computeUsage('moonshotai/kimi-k2', 0, 0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.costUsd).toBe(0);
    });

    it('cost scales linearly with tokens', () => {
      const small = computeUsage('moonshotai/kimi-k2', 100, 50);
      const large = computeUsage('moonshotai/kimi-k2', 1000, 500);
      expect(large.costUsd).toBeGreaterThan(small.costUsd);
      // 10x tokens should be ~10x cost
      expect(large.costUsd / small.costUsd).toBeCloseTo(10, 1);
    });

    it('calculates input and output costs separately', () => {
      const usage = computeUsage('anthropic/claude-opus-4', 1_000_000, 1_000_000);
      const price = MODEL_PRICING['anthropic/claude-opus-4'];
      // 1M input tokens = inputPerMTokens
      // 1M output tokens = outputPerMTokens
      expect(usage.costUsd).toBeCloseTo(price.inputPerMTokens + price.outputPerMTokens, 2);
    });
  });

  describe('formatCost', () => {
    it('formats very small costs with 5 decimals', () => {
      expect(formatCost(0.00001)).toMatch(/\$0\.00001/);
    });

    it('formats small costs with 4 decimals', () => {
      expect(formatCost(0.001)).toMatch(/\$0\.0010/);
    });

    it('formats medium costs with 3 decimals', () => {
      expect(formatCost(0.5)).toMatch(/\$0\.500/);
    });

    it('formats large costs with 2 decimals', () => {
      expect(formatCost(10)).toMatch(/\$10\.00/);
    });

    it('handles zero', () => {
      expect(formatCost(0)).toMatch(/\$/);
    });
  });

  describe('formatTokens', () => {
    it('formats small numbers as-is', () => {
      expect(formatTokens(100)).toBe('100');
      expect(formatTokens(999)).toBe('999');
    });

    it('formats thousands with k suffix', () => {
      expect(formatTokens(1000)).toMatch(/k/);
      expect(formatTokens(1500)).toMatch(/k/);
    });

    it('formats millions with M suffix', () => {
      expect(formatTokens(1_000_000)).toMatch(/M/);
      expect(formatTokens(2_500_000)).toMatch(/M/);
    });

    it('handles zero', () => {
      expect(formatTokens(0)).toBe('0');
    });
  });

  describe('getModelLabel', () => {
    it('returns label for known model', () => {
      expect(getModelLabel('moonshotai/kimi-k2')).toBe('Kimi K2');
      expect(getModelLabel('anthropic/claude-opus-4')).toBe('Claude Opus 4');
    });

    it('returns model id for unknown model', () => {
      expect(getModelLabel('unknown/model')).toBe('unknown/model');
    });
  });
});
