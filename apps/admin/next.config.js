/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@dala/design-tokens',
    '@dala/shared-types',
    '@dala/ui-web',
    '@dala/validation',
  ],
  webpack: (config) => {
    // @sentry/nextjs pulls in OpenTelemetry's auto-instrumentation, which uses
    // dynamic `require`s webpack can't analyse and reports as "Critical
    // dependency" warnings on every compile. They are harmless. Sentry's own
    // `withSentryConfig` registers these exact ignore rules, but this app
    // doesn't wrap its config with it, so we add them here.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@opentelemetry\/instrumentation/, message: /Critical dependency/ },
      { module: /require-in-the-middle/, message: /Critical dependency/ },
    ];
    return config;
  },
};

module.exports = nextConfig;
