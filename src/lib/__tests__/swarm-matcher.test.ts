import { describe, it, expect } from 'vitest';
import { matchAgentsToPrompt, autoSelectAgents, type SwarmAgent } from '../swarm-matcher';

const MOCK_AGENTS: SwarmAgent[] = [
  {
    id: 'sage',
    name: 'Sage',
    specialty: 'Filozof etyka perspektywa długoterminowa',
    description: 'Spokojny myśliciel. Zadaje głębokie pytania i patrzy z perspektywy długoterminowej.',
    color: '#6ec6e7',
    glyph: 'S',
    enabled: true,
  },
  {
    id: 'sceptyk',
    name: 'Sceptyk',
    specialty: 'Krytyk analiza',
    description: 'Szuka luk w argumentacji. Nie ufa oczywistym rozwiązaniom.',
    color: '#ff6b6b',
    glyph: 'S',
    enabled: true,
  },
  {
    id: 'prawnik',
    name: 'Lex',
    specialty: 'Prawo regulacje RODO',
    description: 'Analizuje konsekwencje prawne. Zna polskie i unijne regulacje.',
    color: '#ffd93d',
    glyph: 'L',
    enabled: false,
  },
  {
    id: 'psycholog',
    name: 'Mira',
    specialty: 'Psychologia relacje emocje',
    description: 'Patrzy przez pryzmat emocji i relacji międzyludzkich.',
    color: '#f472b6',
    glyph: 'M',
    enabled: false,
  },
];

describe('swarm-matcher', () => {
  describe('matchAgentsToPrompt', () => {
    it('matches agents by specialty keywords', () => {
      const results = matchAgentsToPrompt('jakie prawo RODO dla danych', MOCK_AGENTS, 3);
      expect(results.length).toBeGreaterThan(0);
      // Lex (prawnik) should be top match
      expect(results[0].agentId).toBe('prawnik');
    });

    it('matches psychologist for emotional questions', () => {
      const results = matchAgentsToPrompt('jak radzić sobie z emocjami w relacji', MOCK_AGENTS, 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].agentId).toBe('psycholog');
    });

    it('returns matched keywords', () => {
      const results = matchAgentsToPrompt('prawo regulacje', MOCK_AGENTS, 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchedKeywords.length).toBeGreaterThan(0);
    });

    it('respects topK limit', () => {
      const results = matchAgentsToPrompt('prawo emocje etyka analiza', MOCK_AGENTS, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('returns empty for empty prompt', () => {
      const results = matchAgentsToPrompt('', MOCK_AGENTS, 3);
      expect(results).toEqual([]);
    });

    it('returns empty for no matches', () => {
      const results = matchAgentsToPrompt('xyzqwerty nonsense', MOCK_AGENTS, 3);
      expect(results.length).toBe(0);
    });

    it('handles empty agents array', () => {
      const results = matchAgentsToPrompt('test', [], 3);
      expect(results).toEqual([]);
    });

    it('scores are between 0 and 1', () => {
      const results = matchAgentsToPrompt('prawo RODO', MOCK_AGENTS, 3);
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it('provides reason for match', () => {
      const results = matchAgentsToPrompt('prawo RODO', MOCK_AGENTS, 3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].reason).toBeTruthy();
      expect(typeof results[0].reason).toBe('string');
    });

    it('sorts results by score descending', () => {
      const results = matchAgentsToPrompt('prawo etyka emocje', MOCK_AGENTS, 4);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('autoSelectAgents', () => {
    it('enables top-K matching agents, disables rest', () => {
      const updated = autoSelectAgents('prawo RODO regulacje', MOCK_AGENTS, 2);
      const enabledCount = updated.filter(a => a.enabled).length;
      expect(enabledCount).toBeLessThanOrEqual(2);
      // Lex should be enabled (best match for prawo RODO)
      const lex = updated.find(a => a.id === 'prawnik');
      expect(lex?.enabled).toBe(true);
    });

    it('falls back to sage + sceptyk when no matches', () => {
      const updated = autoSelectAgents('xyzqwerty nonsense', MOCK_AGENTS, 3);
      const enabled = updated.filter(a => a.enabled);
      const enabledIds = enabled.map(a => a.id);
      expect(enabledIds).toContain('sage');
      expect(enabledIds).toContain('sceptyk');
    });

    it('handles empty prompt', () => {
      const updated = autoSelectAgents('', MOCK_AGENTS, 3);
      const enabled = updated.filter(a => a.enabled);
      expect(enabled.length).toBe(2);
    });

    it('preserves agent properties (id, name, color, etc.)', () => {
      const updated = autoSelectAgents('prawo', MOCK_AGENTS, 3);
      for (const agent of updated) {
        const original = MOCK_AGENTS.find(a => a.id === agent.id);
        expect(agent.name).toBe(original!.name);
        expect(agent.color).toBe(original!.color);
        expect(agent.glyph).toBe(original!.glyph);
        expect(agent.specialty).toBe(original!.specialty);
      }
    });
  });
});
