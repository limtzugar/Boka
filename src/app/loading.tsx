// BOKA OS — Route-level Loading (v0.3.19)

export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#0a0a0f',
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '2px solid rgba(0, 245, 212, 0.3)',
        borderTopColor: '#00f5d4',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
