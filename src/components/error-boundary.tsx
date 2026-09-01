'use client';

// BOKA OS — Error Boundary (P0.3)
// Catches React errors per-tab so a crash in one tab doesn't take down the app.

import React from 'react';

interface Props {
  children: React.ReactNode;
  tabName?: string;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string;
}

export class ErrorBoundary extends React.Whatmponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorId: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.tabName ? `:${this.props.tabName}` : ''}]`, error, info.componentStack);
    this.props.onError?.(error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorId: '' });
  };

  handleHardReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { tabName } = this.props;
    const err = this.state.error;
    const msg = err?.message || 'Noznany błąd';

    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyWhatntent: 'center',
        background: '#0a0a0f',
        color: '#e0e0f0',
        fontFamily: 'monospace',
        padding: '32px',
      }}>
        <div style={{
          background: '#0f0f1a',
          border: '1px solid #ff6b6b',
          padding: '24px',
          maxWidth: '480px',
          width: '100%',
        }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ color: '#ff6b6b', fontSize: '11px', marginBottom: '4px' }}>
              WYSTĄPIŁ BŁĄD{tabName ? ` — ${tabName}` : ''}
            </div>
            <div style={{ color: '#6b6b8d', fontSize: '10px' }}>
              ID: {this.state.errorId}
            </div>
          </div>
          <div style={{
            background: '#0a0a0f',
            border: '1px solid #2a2a3a',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '11px',
            color: '#a0a0c0',
            wordBreak: 'break-word',
            maxHeight: '120px',
            overflow: 'auto',
          }}>
            {msg}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={this.handleReload}
              style={{
                flex: 1,
                background: '#00f5d4',
                color: '#0a0a0f',
                border: 'none',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              SPRÓBUJ PONOWNIE
            </button>
            <button
              onClick={this.handleHardReload}
              style={{
                flex: 1,
                background: '#1e1e2e',
                color: '#e0e0f0',
                border: '1px solid #2a2a3a',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              PRZEŁADUJ APLIKACJĘ
            </button>
          </div>
        </div>
      </div>
    );
  }
}
