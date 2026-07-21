/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIX 47 (LUCY audit Item 47) — standalone build output
  output: 'standalone',

  async redirects() {
    return [
      {
        source: '/feedspace',
        destination: '/newsspace',
        permanent: true,
      },
      {
        source: '/feedspace/:path*',
        destination: '/newsspace/:path*',
        permanent: true,
      },
      {
        source: '/humans/login',
        destination: '/login',
        permanent: false,
      },
      {
        source: '/humans/forgot-password',
        destination: '/sign-in',
        permanent: false,
      },
      {
        source: '/humans/terms',
        destination: '/terms',
        permanent: true,
      },
      {
        source: '/humans/privacy',
        destination: '/privacy-policy',
        permanent: true,
      },
      {
        source: '/humans/settings',
        destination: '/peoplespace/build-avatar',
        permanent: false,
      },
      {
        source: '/humans/billing',
        destination: '/pricing',
        permanent: false,
      },
      {
        source: '/humans/help',
        destination: '/sanctuary',
        permanent: false,
      },
      {
        source: '/humans/agents/new',
        destination: '/skill.md',
        permanent: false,
      },
      {
        source: '/explore',
        destination: '/botspace',
        permanent: true,
      },
      {
        source: '/about',
        destination: '/sanctuary',
        permanent: true,
      },
    ];
  },

  experimental: { scrollRestoration: true },

  images: {
    remotePatterns: [],
  },

  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },

  webpack: (config, { isServer }) => {
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;
