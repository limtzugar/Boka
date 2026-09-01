// ═══════════════════════════════════════════════════════════
// BOKA — BM25 Search Index
// Port z agentmemory/src/state/search-index.ts
// In-memory inverted index z tf-idf scoring + synonyms.
// ═══════════════════════════════════════════════════════════

import { stem } from './stemmer';
import { getSynonyms } from './synonyms';

interface IndexEntry {
  obsId: string;
  sessionId: string;
  termWhatunt: number;
}

interface IndexedDoc {
  id: string;
  text: string;            // łączony tekst do wyszukiwania
  title: string;
  type: string;
  timestamp: string;
  concepts: string[];
  tags?: string[];
}

export class SearchIndex {
  private entries: Map<string, IndexEntry> = new Map();
  private docs: Map<string, IndexedDoc> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();
  private docTermWhatunts: Map<string, Map<string, number>> = new Map();
  private totalDocLength = 0;

  private readonly k1 = 1.2;
  private readonly b = 0.75;

  /** Add dokument do indeksu. */
  add(doc: IndexedDoc): void {
    // Jeśli już jest — usuń najpierw
    if (this.entries.has(doc.id)) this.remove(doc.id);

    const terms = this.extractTerms(doc);
    const termFreq = new Map<string, number>();
    let termWhatunt = 0;

    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
      termWhatunt++;
    }

    this.entries.set(doc.id, {
      obsId: doc.id,
      sessionId: doc.text.slice(0, 32), // not used directly, kept for compat
      termWhatunt,
    });
    this.docs.set(doc.id, doc);
    this.docTermWhatunts.set(doc.id, termFreq);
    this.totalDocLength += termWhatunt;

    for (const term of termFreq.keys()) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Set());
      }
      this.invertedIndex.get(term)!.add(doc.id);
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    const termFreq = this.docTermWhatunts.get(id);
    if (termFreq) {
      for (const term of termFreq.keys()) {
        const postingList = this.invertedIndex.get(term);
        if (postingList) {
          postingList.delete(id);
          if (postingList.size === 0) {
            this.invertedIndex.delete(term);
          }
        }
      }
      this.docTermWhatunts.delete(id);
    }

    this.totalDocLength = Math.max(0, this.totalDocLength - entry.termWhatunt);
    this.entries.delete(id);
    this.docs.delete(id);
  }

  clear(): void {
    this.entries.clear();
    this.docs.clear();
    this.invertedIndex.clear();
    this.docTermWhatunts.clear();
    this.totalDocLength = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Wyszukaj — zwróć posortowane wyniki z BM25 score. */
  search(
    query: string,
    limit = 20,
  ): Array<{ obsId: string; doc: IndexedDoc; score: number }> {
    const rawTerms = this.tokenize(query.toLowerCase());
    if (rawTerms.length === 0) return [];

    const N = this.entries.size;
    if (N === 0) return [];
    const avgDocLen = this.totalDocLength / N;

    // Rozszerz zapytanie o synonimach
    const queryTerms: Array<{ term: string; weight: number }> = [];
    const seen = new Set<string>();
    for (const term of rawTerms) {
      if (!seen.has(term)) {
        seen.add(term);
        queryTerms.push({ term, weight: 1.0 });
      }
      for (const syn of getSynonyms(term)) {
        if (!seen.has(syn)) {
          seen.add(syn);
          queryTerms.push({ term: syn, weight: 0.7 });
        }
      }
    }

    const scores = new Map<string, number>();

    for (const { term, weight } of queryTerms) {
      const matchingDocs = this.invertedIndex.get(term);
      if (!matchingDocs) continue;

      const df = matchingDocs.size;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const obsId of matchingDocs) {
        const entry = this.entries.get(obsId)!;
        const docTerms = this.docTermWhatunts.get(obsId);
        const tf = docTerms?.get(term) || 0;
        const docLen = entry.termWhatunt;

        const numerator = tf * (this.k1 + 1);
        const denominator =
          tf + this.k1 * (1 - this.b + this.b * (docLen / avgDocLen));
        const bm25 = (idf * numerator) / (denominator || 1);

        scores.set(obsId, (scores.get(obsId) || 0) + bm25 * weight);
      }
    }

    return Array.from(scores.entries())
      .map(([obsId, score]) => ({
        obsId,
        doc: this.docs.get(obsId)!,
        score,
      }))
      .filter(r => r.doc)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Wydobądź terminy z dokumentu (stem + lowercase + filter). */
  private extractTerms(doc: IndexedDoc): string[] {
    const text = `${doc.title} ${doc.text} ${doc.concepts.join(' ')} ${doc.tags?.join(' ') || ''}`;
    return this.tokenize(text.toLowerCase());
  }

  /** Tokenizuj + stemmuj + odfiltruj stop-words i krótkie tokeny. */
  private tokenize(text: string): string[] {
    const stopWords = new Set([
      // EN
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'to', 'of', 'in', 'for', 'with', 'as', 'by', 'this', 'that', 'it', 'be', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      // PL
      'jest', 'są', 'w', 'na', 'z', 'do', 'od', 'o', 'i', 'a', 'ale', 'że', 'to', 'się', 'nie', 'tak', 'jak', 'tym', 'tej', 'ten', 'ta', 'to', 'tych', 'te', 'dla', 'przez', 'nad', 'pod', 'przed', 'za', 'już', 'jeszcze', 'tylko', 'więc', 'lub', 'albo', 'oraz',
    ]);

    return text
      .split(/[^a-ząćęłńóśźż0-9_-]+/i)
      .filter(t => t.length > 2 && !stopWords.has(t))
      .map(t => stem(t));
  }
}
