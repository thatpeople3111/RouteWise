import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async headers() {
    return [{ source: '/auth/callback', headers: [
      // OAuth codes/email confirmation tokens arrive in the URL before hydration.
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ] }];
  },
};

export default nextConfig;
