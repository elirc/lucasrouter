import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Nothing here needs to advertise the framework.
  poweredByHeader: false,
  experimental: {
    /*
     * Ship the stylesheet inside the HTML instead of as a <link>. Tailwind
     * produces one ~46 KB atomic sheet that every page must have before it can
     * paint, and it is discovered only after the HTML has been parsed — behind
     * the script preloads in the request queue. Inlining removes that
     * render-blocking round trip. Measured here on a simulated slow 4G phone
     * (5 runs, median): first contentful paint 3.24 s → 1.68 s on `/` and
     * 1.78 s → 1.20 s on `/dispatch`. The cost: Next serialises the inlined
     * sheet into the RSC flight payload as well, so the ~46 KB sheet lands
     * three times per document (~27 KB gzipped of every page is the same
     * CSS repeated) and cannot be cached across navigations. For a demo
     * people open once, first paint wins; revisit if the sheet grows.
     */
    inlineCss: true,
  },
};

export default nextConfig;
