import base from './playwright.config';

// Run the same browser assertions against the deployed bundle, without starting
// a local server. Each Playwright test still receives an isolated fresh context.
export default {
  ...base,
  webServer: undefined,
  use: {
    ...base.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://deploy-preview-1807--footballgmsim.netlify.app',
    ...(process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY || process.env.HTTP_PROXY } }
      : {}),
  },
};
