/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Important for Docker deployments
  poweredByHeader: false,
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Make environment variables available
  env: {
    SOHO_API_URL: process.env.SOHO_API_URL,
  },
};

export default nextConfig; 