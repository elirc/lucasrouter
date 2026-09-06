import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Cache styles across navigations instead of duplicating them in every HTML/RSC payload.
};

export default nextConfig;
