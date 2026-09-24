import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import { Skeleton } from '@/components/ui';
import { ENV } from '@/config/env';
import { logger } from '@/utils/logger';

interface BraintreeHostedFieldsProps {
  clientToken: string;
  onSuccess: (nonce: string, cardDetails: CardDetails) => void;
  onError: (error: string) => void;
  onReady?: () => void;
}

export interface CardDetails {
  cardType: string;
  lastFour: string;
  lastTwo: string;
}

export interface BraintreeHostedFieldsHandle {
  // Always ends in exactly one onSuccess or onError call — never silence.
  submitPayment: () => void;
}

// If the page never answers a submit, give the Pay button back.
const SUBMIT_TIMEOUT_MS = 45_000;

/**
 * Braintree Hosted Fields inside a WebView (native only — react-native-webview
 * does not run on web; the web app pays with Stripe). Card data stays in
 * Braintree's iframes; we only receive a one-time nonce.
 */
const BraintreeHostedFields = forwardRef<BraintreeHostedFieldsHandle, BraintreeHostedFieldsProps>(
  ({ clientToken, onSuccess, onError, onReady }, ref) => {
    const { t } = useTranslation('funnel');
    const webViewRef = useRef<WebView>(null);
    const [pageLoaded, setPageLoaded] = useState(false);
    const [fieldsReady, setFieldsReady] = useState(false);
    const pendingSubmit = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hostedFieldsUrl = `${ENV.API_URL}/payments/hosted-fields-page`;

    const clearPending = () => {
      if (pendingSubmit.current) {
        clearTimeout(pendingSubmit.current);
        pendingSubmit.current = null;
      }
    };

    // Resolve a pending submit with an error (idempotent).
    const fail = (message: string) => {
      clearPending();
      onError(message);
    };

    useEffect(() => clearPending, []);

    useEffect(() => {
      if (pageLoaded && clientToken) {
        webViewRef.current?.postMessage(JSON.stringify({ action: 'initialize', clientToken }));
      }
    }, [pageLoaded, clientToken]);

    const handleMessage = (event: WebViewMessageEvent) => {
      let data: { type?: string; nonce?: string; details?: CardDetails; error?: unknown };
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch (error) {
        logger.error('[BraintreeHostedFields] Unparseable message', error);
        if (pendingSubmit.current) fail(t('payment.errors.hosted.unexpected'));
        return;
      }

      switch (data.type) {
        case 'loaded':
          setPageLoaded(true);
          break;
        case 'ready':
          setFieldsReady(true);
          onReady?.();
          break;
        case 'success':
          clearPending();
          if (typeof data.nonce === 'string' && data.nonce) {
            onSuccess(data.nonce, data.details ?? { cardType: '', lastFour: '', lastTwo: '' });
          } else {
            onError(t('payment.errors.hosted.cardNotVerified'));
          }
          break;
        case 'error': {
          const message = typeof data.error === 'string' && data.error ? data.error : t('payment.errors.hosted.checkCard');
          fail(message);
          break;
        }
        default:
          // Unknown message types are ignored; a pending submit still times out.
          break;
      }
    };

    const handleWebViewError = () => {
      logger.error('[BraintreeHostedFields] WebView failed to load', { url: hostedFieldsUrl });
      setFieldsReady(false);
      fail(t('payment.errors.hosted.loadFailed'));
    };

    useImperativeHandle(ref, () => ({
      submitPayment: () => {
        if (!pageLoaded || !fieldsReady) {
          onError(t('payment.errors.hosted.stillLoading'));
          return;
        }
        if (!webViewRef.current) {
          onError(t('payment.errors.hosted.unavailable'));
          return;
        }
        clearPending();
        pendingSubmit.current = setTimeout(() => {
          pendingSubmit.current = null;
          onError(t('payment.errors.hosted.timeout'));
        }, SUBMIT_TIMEOUT_MS);
        webViewRef.current.postMessage(JSON.stringify({ action: 'submit' }));
      },
    }));

    return (
      <View style={styles.container}>
        {!fieldsReady ? (
          <View style={styles.loading} pointerEvents="none" accessibilityLabel={t('payment.loadingForm')}>
            <Skeleton height={52} radius={Radius.md} />
            <View style={styles.loadingRow}>
              <Skeleton height={52} radius={Radius.md} style={styles.flex} />
              <Skeleton height={52} radius={Radius.md} style={styles.flex} />
            </View>
          </View>
        ) : null}

        <WebView
          ref={webViewRef}
          source={{ uri: hostedFieldsUrl }}
          onMessage={handleMessage}
          onError={handleWebViewError}
          onHttpError={handleWebViewError}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          mixedContentMode="compatibility"
          originWhitelist={['https://*', 'http://*']}
        />
      </View>
    );
  }
);

BraintreeHostedFields.displayName = 'BraintreeHostedFields';

const styles = StyleSheet.create({
  container: {
    height: 320,
    marginVertical: Space.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    padding: Space.lg,
    gap: Space.md,
    backgroundColor: Colors.surface,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  flex: {
    flex: 1,
  },
});

export default BraintreeHostedFields;
