/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — the OMA PDF import feature (/import) accepts PDFs
      // up to 10MB (enforced again, redundantly, in parsePdf itself).
      bodySizeLimit: "10mb",
    },
  },
}
export default nextConfig
