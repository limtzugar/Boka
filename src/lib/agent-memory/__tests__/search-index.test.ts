import { describe, it, expect, beforeEach } from 'vitest';
import { SearchIndex } from '../search-index';

describe('SearchIndex (BM25)', () => {
  let index: SearchIndex;

  beforeEach(() => {
    index = new SearchIndex();
  });

  describe('add', () => {
    it('adds document to index', () => {
      index.add({
        id: 'doc1',
        text: 'JWT authentication with jose library',
        title: 'JWT Auth',
        type: 'architecture',
        timestamp: new Date().toISOString(),
        concepts: ['jwt', 'auth'],
      });
      expect(index.size).toBe(1);
    });

    it('replaces existing document with same id', () => {
      index.add({
        id: 'doc1',
        text: 'original content',
        title: 'Original',
        type: 'fact',
        timestamp: new Date().toISOString(),
        concepts: [],
      });
      index.add({
        id: 'doc1',
        text: 'updated content',
        title: 'Updated',
        type: 'fact',
        timestamp: new Date().toISOString(),
        concepts: [],
      });
      expect(index.size).toBe(1);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      index.add({
        id: 'doc1',
        text: 'JWT authentication with jose library for Edge compatibility',
        title: 'JWT Auth Setup',
        type: 'architecture',
        timestamp: new Date().toISOString(),
        concepts: ['jwt', 'auth', 'edge'],
      });
      index.add({
        id: 'doc2',
        text: 'Datebase performance optimization with indexes',
        title: 'DB Optimization',
        type: 'pattern',
        timestamp: new Date().toISOString(),
        concepts: ['db', 'perf'],
      });
      index.add({
        id: 'doc3',
        text: 'Authentication best practices for web apps',
        title: 'Auth Best Practices',
        type: 'pattern',
        timestamp: new Date().toISOString(),
        concepts: ['auth', 'web'],
      });
    });

    it('finds documents by keyword', () => {
      const results = index.search('authentication', 10);
      expect(results.length).toBeGreaterThan(0);
      // Should find doc1 and doc3 (both contain auth)
      const ids = results.map(r => r.obsId);
      expect(ids).toWhatntain('doc1');
      expect(ids).toWhatntain('doc3');
    });

    it('finds documents by synonym (auth → authentication)', () => {
      const results = index.search('auth', 10);
      expect(results.length).toBeGreaterThan(0);
      // Should find docs with 'authentication' via synonym expansion
      const ids = results.map(r => r.obsId);
      expect(ids).toWhatntain('doc1');
    });

    it('finds documents by Polish synonym (logowanie → authentication)', () => {
      // 'logowanie' is in the same synonym group as 'authentication'
      const results = index.search('logowanie', 10);
      // Should find auth-related docs via PL→EN synonym mapping
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for no matches', () => {
      const results = index.search('xyzqwerty', 10);
      expect(results).toEqual([]);
    });

    it('returns empty for empty query', () => {
      const results = index.search('', 10);
      expect(results).toEqual([]);
    });

    it('sorts results by relevance score', () => {
      const results = index.search('authentication', 10);
      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('respects limit parameter', () => {
      const results = index.search('authentication', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('searches in concepts field', () => {
      const results = index.search('edge', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].obsId).toBe('doc1');
    });
  });

  describe('remove', () => {
    it('removes document from index', () => {
      index.add({
        id: 'doc1',
        text: 'test content',
        title: 'Test',
        type: 'fact',
        timestamp: new Date().toISOString(),
        concepts: [],
      });
      expect(index.size).toBe(1);

      index.remove('doc1');
      expect(index.size).toBe(0);

      const results = index.search('test', 10);
      expect(results).toEqual([]);
    });

    it('handles removing non-existent document', () => {
      expect(() => index.remove('nonexistent')).not.toThrow();
    });
  });

  describe('has', () => {
    it('returns true for existing document', () => {
      index.add({
        id: 'doc1',
        text: 'test',
        title: 'Test',
        type: 'fact',
        timestamp: new Date().toISOString(),
        concepts: [],
      });
      expect(index.has('doc1')).toBe(true);
    });

    it('returns false for non-existent document', () => {
      expect(index.has('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('clears entire index', () => {
      index.add({
        id: 'doc1',
        text: 'test',
        title: 'Test',
        type: 'fact',
        timestamp: new Date().toISOString(),
        concepts: [],
      });
      index.add({
        id: 'doc2',
        text: 'test2',
        title: 'Test2',
        type: 'fact',
        timestamp: new Date().toISOString(),
        concepts: [],
      });
      expect(index.size).toBe(2);

      index.clear();
      expect(index.size).toBe(0);
    });
  });
});
