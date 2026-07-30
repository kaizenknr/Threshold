// Expo injects EXPO_PUBLIC_* variables into process.env at build time.
// Declare just the shape we read, so we don't pull full Node globals into RN.
export {};
declare global {
  // eslint-disable-next-line no-var
  var process: { env: Record<string, string | undefined> };
}
