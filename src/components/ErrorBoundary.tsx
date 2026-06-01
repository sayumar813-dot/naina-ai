import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Naina crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', color: 'white',
          background: '#050508', fontFamily: 'Rajdhani, sans-serif', gap: '16px'
        }}>
          <div style={{ fontSize: '48px' }}>😤</div>
          <h2 style={{ margin: 0, fontSize: '22px', color: '#f43f5e' }}>
            Naina is having a moment
          </h2>
          <p style={{ opacity: 0.5, fontSize: '13px', margin: 0 }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px', padding: '10px 28px',
              background: 'linear-gradient(135deg, #6366f1, #f43f5e)',
              border: 'none', borderRadius: '24px', color: 'white',
              cursor: 'pointer', fontSize: '15px', fontWeight: 600,
              letterSpacing: '0.04em'
            }}
          >
            Restart Naina
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
