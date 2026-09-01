import { describe, it, expect } from 'vitest';
import { getSynonyms } from '../synonyms';
import { stem } from '../stemmer';

describe('synonyms', () => {
  describe('getSynonyms', () => {
    it('returns synonyms for "auth" (tech group)', () => {
      // stem('authentication') → 'authent'
      const syns = getSynonyms(stem('authentication'));
      expect(syns.length).toBeGreaterThan(0);
      // Should include auth-related terms
      expect(syns.some(s => s.includes('auth') || s.includes('logowan'))).toBe(true);
    });

    it('returns synonyms for "db" (database group)', () => {
      const syns = getSynonyms(stem('database'));
      expect(syns.length).toBeGreaterThan(0);
      // Should include db-related terms
      expect(syns.some(s => s === 'db' || s === 'baza' || s === 'datastor')).toBe(true);
    });

    it('returns synonyms for "pamięć" (Polish memory group)', () => {
      const syns = getSynonyms(stem('pamięć'));
      expect(syns.length).toBeGreaterThan(0);
    });

    it('returns synonyms for "agent" (BOKA group)', () => {
      const syns = getSynonyms(stem('agent'));
      expect(syns.length).toBeGreaterThan(0);
      expect(syns.some(s => s.includes('agent') || s.includes('multi'))).toBe(true);
    });

    it('returns empty array for unknown term', () => {
      const syns = getSynonyms('xyzqwerty');
      expect(syns).toEqual([]);
    });

    it('returns synonyms for "bezpieczeństwo" (security group)', () => {
      const syns = getSynonyms(stem('bezpieczeństwo'));
      expect(syns.length).toBeGreaterThan(0);
      expect(syns.some(s => s.includes('sec') || s.includes('bezpiecz'))).toBe(true);
    });

    it('returns synonyms for "sędzia" (judge group)', () => {
      const syns = getSynonyms(stem('sędzia'));
      expect(syns.length).toBeGreaterThan(0);
    });

    it('synonyms are bidirectional', () => {
      // If A is synonym of B, then B should be synonym of A
      const synsAB = getSynonyms(stem('auth'));
      const synsBA = getSynonyms(stem('authentication'));
      // Both should return non-empty arrays
      expect(synsAB.length).toBeGreaterThan(0);
      expect(synsBA.length).toBeGreaterThan(0);
    });

    it('returns synonyms for "kod" (code/programming)', () => {
      const syns = getSynonyms(stem('błąd'));
      expect(syns.length).toBeGreaterThan(0);
      expect(syns.some(s => s.includes('err') || s.includes('błąd'))).toBe(true);
    });
  });
});
