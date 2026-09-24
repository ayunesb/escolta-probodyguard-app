import React from 'react';
import { useRouter } from 'expo-router';
import { logger } from '@/utils/logger';
import { ErrorFallbackView } from '@/components/ErrorBoundary';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Limite de error para pantallas criticas (pago, reserva, administracion).
 * Atrapa el error y muestra la vista de error de la marca con salida.
 */
export class CriticalScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(
      '[CriticalScreenErrorBoundary] Screen crashed',
      { error, componentStack: errorInfo.componentStack },
      { sendToMonitoring: true }
    );
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ScreenErrorFallback error={this.state.error} onReset={this.handleReset} message={this.props.fallbackMessage} />;
    }
    return this.props.children;
  }
}

function ScreenErrorFallback({ error, onReset, message }: { error: Error | null; onReset: () => void; message?: string }) {
  const router = useRouter();
  return (
    <ErrorFallbackView
      error={error}
      message={message}
      primaryLabel="Try again"
      onPrimary={onReset}
      secondaryLabel="Go to home"
      onSecondary={() => {
        onReset();
        // "/" reparte por rol (antes iba a "/(tabs)", que no es una ruta)
        router.replace('/');
      }}
    />
  );
}

/**
 * Envuelve una pantalla con el limite de error.
 *
 * export default withErrorBoundary(MyScreen, {
 *   fallbackMessage: 'Unable to load payment screen',
 * });
 */
export function withErrorBoundary<P extends object>(Component: React.ComponentType<P>, options?: Omit<Props, 'children'>) {
  return function WrappedComponent(props: P) {
    return (
      <CriticalScreenErrorBoundary {...options}>
        <Component {...props} />
      </CriticalScreenErrorBoundary>
    );
  };
}
