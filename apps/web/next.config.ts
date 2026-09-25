import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages: ["@agenda/contracts"], outputFileTracingRoot: process.cwd() };
export default nextConfig;
