// BOKA OS — Global Error (v0.3.19)
// Catches errors that error.tsx misses (root layout errors).

'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ margin: 0, background: '#0a0a0f', color: '#e0e0f0', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyWhatntent: 'center', minHeight: '100vh' }}>
          <div style={{ background: '#0f0f1a', border: '1px solid #ff6b6b', padding: '24px', maxWidth: '480px', textAlign: 'center' }}>
            <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '8px' }}>
              KRYTYCZNY BŁĄD BOKA
            </div>
            <div style={{ color: '#6b6b8d', fontSize: '10px', marginBottom: '16px' }}>
              {error.message?.substring(0, 200)}
            </div>
            <button
              onClick={reset}
              style={{ background: '#00f5d4', color: '#0a0a0f', border: 'none', padding: '8px 24px', fontFamily: 'monospace', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              URUCHOM PONOWNIE
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
