import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Dev is bound on 0.0.0.0. Next only allows localhost unless listed here.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
