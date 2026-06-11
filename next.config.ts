import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage 공개 객체(아바타) next/image 허용
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
