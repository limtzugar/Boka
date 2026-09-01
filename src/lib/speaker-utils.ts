/**
 * Speaker Identification Utilities
 *
 * Mathematical helpers for comparing voice spectral fingerprints.
 * Used by use-speaker-id hook to match unknown speakers against stored profiles.
 */

/**
 * Downsample a full-resolution frequency spectrum into fewer bins.
 *
 * Takes raw frequency data (typically 128 or 256 bins from AnalyserNode)
 * and averages groups of samples into `targetBins` output bins.
 * This reduces noise and makes comparisons faster and more robust.
 *
 * @param data   - Raw frequency magnitude data from AnalyserNode.getByteFrequencyData()
 * @param targetBins - Desired output bin count (e.g. 32)
 * @returns Normalized array of `targetBins` averaged magnitudes (0-1 range)
 */
export function downsampleSpectrum(data: Uint8Array, targetBins: number): number[] {
  if (data.length === 0) return new Array(targetBins).fill(0);

  const binSize = Math.floor(data.length / targetBins);
  const result: number[] = [];

  for (let i = 0; i < targetBins; i++) {
    const start = i * binSize;
    const end = i === targetBins - 1 ? data.length : start + binSize;
    let sum = 0;
    let count = 0;

    for (let j = start; j < end; j++) {
      sum += data[j] ?? 0;
      count++;
    }

    // Normalize to 0-1 range (byte frequency data is 0-255)
    result.push(count > 0 ? sum / count / 255 : 0);
  }

  return result;
}

/**
 * Compute cosine similarity between two equal-length vectors.
 *
 * Returns a value in [-1, 1] where:
 *   1  = identical direction (perfect match)
 *   0  = orthogonal (no similarity)
 *  -1  = opposite direction
 *
 * For spectral fingerprints we expect values in [0, 1] since magnitudes
 * are non-negative.
 *
 * @param a - First vector
 * @param b - Second vector (must be same length as `a`)
 * @returns Cosine similarity score
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude < 1e-10) return 0;

  return dotProduct / magnitude;
}

/**
 * Compute Euclidean distance between two equal-length vectors.
 *
 * Lower values indicate greater similarity.
 * Unlike cosine similarity, this is sensitive to absolute magnitude,
 * which can be useful when volume/loudness matters.
 *
 * @param a - First vector
 * @param b - Second vector (must be same length as `a`)
 * @returns Euclidean distance (>= 0)
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity;

  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sumSquares += diff * diff;
  }

  return Math.sqrt(sumSquares);
}

/**
 * Normalize a spectrum vector to unit length (L2 normalization).
 *
 * This makes the vector direction-only, removing the effect of
 * absolute loudness. After normalization, cosine similarity becomes
 * simply the dot product.
 *
 * @param data - Input spectrum vector
 * @returns L2-normalized copy of the input
 */
export function normalizeSpectrum(data: number[]): number[] {
  let normSq = 0;
  for (let i = 0; i < data.length; i++) {
    normSq += data[i]! * data[i]!;
  }

  const norm = Math.sqrt(normSq);
  if (norm < 1e-10) return new Array(data.length).fill(0);

  return data.map(v => v / norm);
}

/**
 * Compute a weighted combination of cosine similarity and
 * inverse Euclidean distance for a more robust match score.
 *
 * This combines the strengths of both metrics:
 *  - Cosine similarity captures spectral shape regardless of volume
 *  - Euclidean distance penalizes absolute magnitude differences
 *
 * @param a - First spectrum vector
 * @param b - Second spectrum vector
 * @param cosineWeight - Weight for cosine similarity component (default 0.7)
 * @returns Combined score in [0, 1] where 1 = perfect match
 */
export function combinedSimilarity(
  a: number[],
  b: number[],
  cosineWeight: number = 0.7,
): number {
  const cosSim = cosineSimilarity(a, b);

  // Convert Euclidean distance to a [0,1] similarity measure
  // Max possible distance for normalized vectors is 2 (opposite directions)
  const eucDist = euclideanDistance(normalizeSpectrum(a), normalizeSpectrum(b));
  const eucSim = Math.max(0, 1 - eucDist / 2);

  return cosineWeight * cosSim + (1 - cosineWeight) * eucSim;
}
