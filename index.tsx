/**
 * ABTIK boot entry.
 *
 * Wraps expo-router's entry so any startup failure lands on a dark, readable
 * error screen instead of the blank white window a release build otherwise
 * shows:
 *
 *   - module-eval crashes while expo-router builds the route table
 *     (caught around `require('expo-router/entry')` — React never mounts)
 *   - render-phase throws before an error boundary exists
 *     (caught by the global handler, which re-runs the root into the
 *     fallback screen using the captured native rootTag)
 *
 * Production builds have no redbox — uncaught errors only reach logcat,
 * which is invisible during a live demo. This screen surfaces them on the
 * app's navy canvas instead. Dev builds keep the standard error overlay.
 */

import React, { useEffect } from 'react';
import { AppRegistry, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

type GlobalErrorUtils = {
  setGlobalExceptionHandler?: (
    handler: (error: unknown, isFatal?: boolean) => void,
  ) => void;
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | null;
};

let bootError: unknown = null;
let rootTag: number | null = null;

function describeError(error: unknown): string {
  if (error == null) return 'Unknown startup error';
  if (typeof error === 'string') return error;
  const err = error as { name?: string; message?: string; stack?: string };
  const name = err.name ? `${err.name}: ` : '';
  const message = err.message || String(error);
  const stack = err.stack ? `\n\n${err.stack}` : '';
  return `${name}${message}${stack}`;
}

function BootErrorScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>ABTIK hit a startup error</Text>
        <Text style={styles.hint}>
          The demo could not finish loading. Screenshot this message so it can
          be fixed — or reinstall the latest build from the EAS link.
        </Text>
        <View style={styles.box}>
          <Text style={styles.error} selectable>
            {describeError(bootError)}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function showBootError(error: unknown): void {
  bootError = error;
  try {
    AppRegistry.registerComponent('main', () => BootErrorScreen);
    if (rootTag != null) {
      // Re-run into the same native root after React unmounted a broken tree.
      AppRegistry.runApplication('main', { rootTag, initialProps: {} });
    }
    SplashScreen.hideAsync().catch(() => {});
  } catch (err) {
    console.error('[ABTIK] could not render the boot error screen', err);
  }
}

// Capture the native root tag so render-phase crashes can re-run into the
// fallback screen above.
const originalRunApplication = AppRegistry.runApplication;
AppRegistry.runApplication = (appKey, appParameters) => {
  const params = appParameters as { rootTag?: number } | undefined;
  if (params && typeof params.rootTag === 'number') {
    rootTag = params.rootTag;
  }
  return originalRunApplication(appKey, appParameters);
};

// Uncaught JS errors: route-table eval, render throws outside boundaries,
// async failures after boot.
const errorUtils = (globalThis as { ErrorUtils?: GlobalErrorUtils })
  .ErrorUtils;
if (errorUtils && typeof errorUtils.setGlobalExceptionHandler === 'function') {
  const previous =
    typeof errorUtils.getGlobalHandler === 'function'
      ? errorUtils.getGlobalHandler()
      : null;
  errorUtils.setGlobalExceptionHandler((error, isFatal) => {
    console.error('[ABTIK] uncaught error', error);
    if (process.env.NODE_ENV !== 'production' && previous) {
      // Dev keeps the standard redbox overlay.
      previous(error, isFatal);
      return;
    }
    showBootError(error);
  });
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-router/entry');
} catch (error) {
  showBootError(error);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
  },
  hint: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 21,
  },
  box: {
    backgroundColor: '#111C33',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 12,
    padding: 14,
  },
  error: {
    color: '#FCA5A5',
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'monospace',
  },
});
