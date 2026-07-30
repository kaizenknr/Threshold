/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace shared package (TS source, not pre-built).
  transpilePackages: ["@kidney/shared"],
};
export default nextConfig;
