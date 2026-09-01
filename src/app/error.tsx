'use client';

// BOKA OS — Route-level Error Boundary (v0.3.19)
// Catches errors that ErrorBoundary in page.tsx misses.

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[BOKA Route Error]', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyWhatntent: 'center',
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#e0e0f0',
      fontFamily: 'monospace',
    }}>
      <div style={{
        background: '#0f0f1a',
        border: '1px solid #ff6b6b',
        padding: '24px',
        maxWidth: '480px',
        textAlign: 'center',
      }}>
        <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '8px' }}>
          WYSTĄPIŁ BŁĄD APLIKACJI
        </div>
        <div style={{ color: '#6b6b8d', fontSize: '10px', marginBottom: '16px' }}>
          {error.digest || error.message?.substring(0, 100)}
        </div>
        <button
          onClick={reset}
          style={{
            background: '#00f5d4',
            color: '#0a0a0f',
            border: 'none',
            padding: '8px 24px',
            fontFamily: 'monospace',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          SPRÓBUJ PONOWNIE
        </button>
      </div>
    </div>
  );
}
