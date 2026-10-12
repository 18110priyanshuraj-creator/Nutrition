import type { NextConfig } from "next";
const nextConfig: NextConfig = { poweredByHeader: false, serverExternalPackages: ["better-sqlite3"], experimental: { serverActions: { bodySizeLimit: "2mb" } } };
export default nextConfig;