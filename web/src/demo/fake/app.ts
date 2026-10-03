/** Stand-in for `firebase/app` in the demo build. */
export function initializeApp(options: unknown) {
  return { name: '[DEFAULT]', options, automaticDataCollectionEnabled: false }
}
