import * as Sentry from '@sentry/react-native';
import { ArrowClockwiseIcon, WarningCircleIcon } from 'phosphor-react-native';
import { Component, type ReactNode } from 'react';
import { Text, View, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/shell/ErrorBoundary.tsx
 *
 * Phase 12 (improvement-plan §10.3). No error boundary existed anywhere
 * in the app before this — confirmed by grepping for `componentDidCatch`/
 * `getDerivedStateFromError` across `apps/mobile/src`, zero matches. Any
 * render-time exception anywhere in the tree (a null-deref in a screen, a
 * bad prop passed to a themed component) previously unmounted the entire
 * app to a blank native screen with no recovery path and, per
 * `sentry.ts`'s own finding, was never even reaching Sentry's backend.
 *
 * Class component: React only supports error boundaries via
 * `componentDidCatch`/`getDerivedStateFromError` — there is no hook
 * equivalent (confirmed current as of the React version this app pins;
 * this has been true since error boundaries were introduced and remains
 * so). This is the one unavoidable class component in an otherwise
 * all-function-component codebase.
 *
 * Deliberately reports via `Sentry.captureException` directly here
 * (rather than relying solely on the SDK's own automatic render-error
 * capture) so the report carries the React `componentStack` in `extra` —
 * genuinely more useful for debugging a render crash than a bare stack
 * trace, and cheap to attach since `componentDidCatch`'s own second
 * argument already carries it.
 *
 * "Reload" resets local boundary state rather than actually restarting
 * the JS bundle (no `expo-updates`-style `Updates.reloadAsync()` call
 * here even though this phase separately adds `expo-updates` for OTA —
 * see `OtaUpdateChecker.tsx`'s own header for why the two are kept
 * decoupled) — a state reset is enough to recover from the common case
 * (a transient bad-data render crash on one screen) without forcing a
 * full app relaunch, and works identically whether or not OTA ends up
 * enabled for a given build.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] render crash', error, info.componentStack);
    Sentry.captureException(error, {
      tags: { feature: 'render_crash' },
      extra: { componentStack: info.componentStack },
    });
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorBoundaryFallback onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

function ErrorBoundaryFallback({ onReset }: { onReset: () => void }) {
  const tc = useTokenColor();
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      paddingHorizontal="$4"
      backgroundColor="$neutral25"
    >
      <View
        width={64}
        height={64}
        borderRadius={999}
        backgroundColor="$neutral100"
        alignItems="center"
        justifyContent="center"
      >
        <WarningCircleIcon size={28} weight="fill" color={tc.danger} />
      </View>
      <Text fontFamily="$display" fontSize={18} fontWeight="600" marginTop="$3" textAlign="center">
        Une erreur inattendue est survenue
      </Text>
      <Text color="$neutral500" fontSize={14} marginTop="$1.5" textAlign="center" maxWidth={320}>
        L'application a rencontré un problème. Vous pouvez réessayer — si le problème persiste,
        fermez et rouvrez l'application.
      </Text>
      <View marginTop="$4">
        <Button fullWidth={false} variant="secondary" icon={ArrowClockwiseIcon} onPress={onReset}>
          Réessayer
        </Button>
      </View>
    </YStack>
  );
}
