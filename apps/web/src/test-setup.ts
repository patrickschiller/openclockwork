// Existing UI fixtures exercise German. Set it explicitly; production detects
// the browser language and falls back to English. Locale tests override this.
Object.defineProperty(navigator, 'languages', {
  configurable: true,
  get: () => ['de-DE'],
});
