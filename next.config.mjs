/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@prisma/client", "cheerio", "pdfkit", "exceljs"],
  // data/proof.json is read with fs at runtime, so file tracing can't see it; ship it explicitly.
  outputFileTracingIncludes: { "/api/**": ["./data/**"] },
};
export default nextConfig;
