import type { NextConfig } from "next";

/*
 * Baseline security headers. This app holds patient health data, so the
 * defaults below are the minimum a clinic's security review will look for.
 *
 * Content-Security-Policy is deliberately NOT set here yet: Next.js
 * injects inline bootstrap scripts, so a useful policy needs per-request
 * nonces generated in proxy.ts. Adding a blanket `unsafe-inline` policy
 * would look like protection while providing almost none. Ship CSP as its
 * own change, in report-only first.
 */
const securityHeaders = [
  // Browsers must never downgrade to http:// once they've seen this host.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // No part of this app is meant to be embedded — blocks clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Patient/case ids can appear in URLs; don't leak them to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Posture analysis uses a file picker, never the camera or microphone.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
