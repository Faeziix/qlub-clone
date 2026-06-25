/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn-customerapp.qlub.io" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.qlub.io" },
    ],
  },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
