/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIX 47 (LUCY audit Item 47) — standalone build output
  // Produces a self-contained .next/standalone/ directory that does not require
  // the full node_modules to run. Dramatically reduces deployment size.
  // NOTE: Changes startup from `next start` to `node .next/standalone/server.js`.
  // ecosystem.config.js startup command must be updated at the coordinated restart.
  output: 'standalone',

  experimental: { scrollRestoration: true },

  images: {
    remotePatterns: [],
  },

  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },

  webpack: (config, { isServer }) => {
    // FIX 27 (LUCY audit Item 27) — webpack cache DEFERRED
    // TODO: Re-enable cache after upgrading to 8GB+ droplet.
    // Currently disabled to avoid OOM during build on the 4GB droplet.
    // See LUCY audit Item 28 (droplet upgrade assessment).
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;
