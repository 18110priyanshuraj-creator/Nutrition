import type { NextConfig } from "next";
const nextConfig: NextConfig = {
 poweredByHeader: false,
 distDir: process.env.MYNUTRI_AGENT_BUILD === "true" ? ".next-agent-check" : ".next",
 serverExternalPackages: ["better-sqlite3"],
 experimental: { serverActions: { bodySizeLimit: "2mb" } }
};
export default nextConfig;