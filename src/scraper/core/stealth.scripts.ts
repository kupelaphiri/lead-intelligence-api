/**
 * Collection of browser init scripts that harden against bot detection.
 * Injected via context.addInitScript() before any page navigation.
 *
 * These mimic what puppeteer-extra-plugin-stealth does but without
 * the puppeteer dependency.
 */

/** Hide the `navigator.webdriver` property that Playwright sets. */
export const HIDE_WEBDRIVER = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  delete navigator.__proto__.webdriver;
`;

/** Override `navigator.plugins` to look like a real Chrome. */
export const FAKE_PLUGINS = `
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      plugins.length = 3;
      return plugins;
    },
  });
`;

/** Override `navigator.languages` to return a realistic set. */
export const FAKE_LANGUAGES = `
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });
`;

/** Override `navigator.permissions.query` to mask the automation origin. */
export const FAKE_PERMISSIONS = `
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
`;

/** Override `window.chrome` to look like real Chrome. */
export const FAKE_CHROME_RUNTIME = `
  window.chrome = {
    runtime: {
      connect: function() {},
      sendMessage: function() {},
      onMessage: { addListener: function() {} },
    },
    loadTimes: function() {},
    csi: function() {},
  };
`;

/** Override WebGL renderer/vendor to mask headless signals. */
export const FAKE_WEBGL = `
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    // UNMASKED_VENDOR_WEBGL
    if (parameter === 37445) return 'Intel Inc.';
    // UNMASKED_RENDERER_WEBGL
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.call(this, parameter);
  };
`;

/** Prevent detection via `window.outerWidth/outerHeight === 0`. */
export const FIX_WINDOW_DIMENSIONS = `
  if (window.outerWidth === 0) {
    Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
  }
  if (window.outerHeight === 0) {
    Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85 });
  }
`;

/** Fake `navigator.hardwareConcurrency` with a realistic value. */
export const FAKE_HARDWARE_CONCURRENCY = `
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
`;

/** Fake `navigator.deviceMemory` for Chromium-based fingerprinting. */
export const FAKE_DEVICE_MEMORY = `
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
`;

/** All stealth scripts combined, ready for a single addInitScript call. */
export const ALL_STEALTH_SCRIPTS = [
  HIDE_WEBDRIVER,
  FAKE_PLUGINS,
  FAKE_LANGUAGES,
  FAKE_PERMISSIONS,
  FAKE_CHROME_RUNTIME,
  FAKE_WEBGL,
  FIX_WINDOW_DIMENSIONS,
  FAKE_HARDWARE_CONCURRENCY,
  FAKE_DEVICE_MEMORY,
].join('\n');
