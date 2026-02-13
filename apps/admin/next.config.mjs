const nextConfig = {
  transpilePackages: ["@bynle/db", "@bynle/shared"],
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
