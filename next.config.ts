import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.chesscomfiles.com",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
