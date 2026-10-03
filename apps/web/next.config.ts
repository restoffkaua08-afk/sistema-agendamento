import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages: ["@agenda/contracts"], outputFileTracingRoot: process.cwd(), webpack(config) { config.resolve.extensionAlias = { ...(config.resolve.extensionAlias ?? {}), ".js": [".ts", ".tsx", ".js"] }; return config; } };
export default nextConfig;
