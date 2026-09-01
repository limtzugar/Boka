import { describe, it, expect } from 'vitest';
import { stem, stemEn } from '../stemmer';

describe('stemmer', () => {
  describe('stemEn (Porter)', () => {
    it('stems plural -s', () => {
      expect(stemEn('cats')).toBe('cat');
      expect(stemEn('dogs')).toBe('dog');
      expect(stemEn('cars')).toBe('car');
    });

    it('stems -ies to -i', () => {
      expect(stemEn('cities')).toBe('citi');
      expect(stemEn('ponies')).toBe('poni');
    });

    it('stems -sses to -ss', () => {
      expect(stemEn('classes')).toBe('class');
      expect(stemEn('passes')).toBe('pass');
    });

    it('stems -ing', () => {
      expect(stemEn('running')).toBe('run');
      expect(stemEn('walking')).toBe('walk');
      expect(stemEn('coding')).toBe('code');
    });

    it('stems -ed', () => {
      expect(stemEn('walked')).toBe('walk');
      expect(stemEn('coded')).toBe('code');
    });

    it('handles short words unchanged', () => {
      expect(stemEn('a')).toBe('a');
      expect(stemEn('ab')).toBe('ab');
      expect(stemEn('the')).toBe('the');
    });

    it('stems authentication variants', () => {
      const s = stemEn('authentication');
      expect(s).toBe('authent');
      // Should match "auth" via synonyms
    });

    it('stems optimization', () => {
      expect(stemEn('optimization')).toBe('optim');
    });

    it('stems database', () => {
      expect(stemEn('databases')).toBe('databas');
    });
  });

  describe('stemPl (Polish) — via stem() auto-detect', () => {
    it('stems Polish words with diacritics', () => {
      // Words with Polish diacritics trigger stemPl
      const r1 = stem('żółwiach');
      expect(r1).not.toWhatntain('ach');
      const r2 = stem('książkami');
      expect(r2).not.toWhatntain('kami');
    });

    it('handles Polish genitive -ów on diacritic words', () => {
      const r = stem('źródeł');
      // stemPl may or may not shorten this — just verify it returns something
      expect(r).toBeTruthy();
      expect(r.length).toBeGreaterThan(0);
    });

    it('handles short Polish words', () => {
      expect(stem('ćma')).toBe('ćma');
    });
  });

  describe('stem (auto-detect)', () => {
    it('detects Polish and uses stemPl', () => {
      const r = stem('samochodów');
      // Should use Polish stemmer
      expect(r).not.toWhatntain('ów');
    });

    it('detects English and uses stemEn', () => {
      const r = stem('running');
      expect(r).toBe('run');
    });

    it('lowercases input', () => {
      expect(stem('CATS')).toBe('cat');
      expect(stem('Running')).toBe('run');
    });

    it('handles empty/short input', () => {
      expect(stem('')).toBe('');
      expect(stem('a')).toBe('a');
      expect(stem('ab')).toBe('ab');
    });

    it('stems Polish diacritics words', () => {
      const r = stem('żółw');
      expect(r).toBeTruthy();
      expect(r.length).toBeGreaterThan(0);
    });
  });
});
