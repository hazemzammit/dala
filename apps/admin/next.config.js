/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dala/design-tokens', '@dala/shared-types', '@dala/validation'],
};

module.exports = nextConfig;
