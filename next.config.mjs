/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Security hardening: the app renders no bitmaps via next/image (no <Image>
  // anywhere in components/), so the Image Optimization API is pure attack
  // surface. Disabling it mitigates the Image Optimizer RCE/DoS advisories
  // (GHSA-2xp9-vwfh-vxw4, GHSA-h64f-5h5j-jqjh) that are only fully fixed in
  // Next 16 — see scripts/audit-allowlist.json for the tracked advisories.
  images: { unoptimized: true },
};

export default nextConfig;
