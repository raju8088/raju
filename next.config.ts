import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],

  // ─── Security Headers ────────────────────────────────────────────────────────
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';

    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Block clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Control referrer in cross-origin requests
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restrict browser feature access
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Force HTTPS for 1 year in production
          ...(isProduction
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains; preload',
                },
              ]
            : []),
          // Content-Security-Policy — permissive enough for Next.js + inline styles
          // Tighten further once a nonce-based CSP approach is confirmed compatible.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js requires 'unsafe-inline' for CSS-in-JS and React hydration
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // Scripts: self + inline eval needed by Next.js dev; restricted in prod
              isProduction
                ? "script-src 'self'"
                : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "img-src 'self' data: https:",
              // Allow Razorpay checkout and OmniDimension provider in connect-src
              "connect-src 'self' https://api.razorpay.com https://*.omnidimension.ai https://graph.facebook.com",
              "frame-src 'self' https://api.razorpay.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        // Webhook endpoints: no CSP needed, raw payload handling
        source: '/api/webhooks/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },

  // ─── Production source-map strategy ──────────────────────────────────────────
  // Do not expose server-side source maps in production builds.
  productionBrowserSourceMaps: false,
};

export default nextConfig;
