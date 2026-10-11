import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  deploymentId:
    process.env.WORKERS_CI_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.NEXT_DEPLOYMENT_ID,
  experimental: {
    globalNotFound: true,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.cdndsgni.com" },
      { protocol: "https", hostname: "image.pngaaa.com" },
      { protocol: "https", hostname: "thebottlesbkk.store" },
      { protocol: "https", hostname: "www.pngfind.com" },
      { protocol: "https", hostname: "www.clipartmax.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: __dirname,
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default withNextIntl(nextConfig);
