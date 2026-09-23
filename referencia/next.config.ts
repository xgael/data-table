import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los avisos (Sileo) viven abajo a la izquierda; el indicador de desarrollo los tapaba.
  devIndicators: { position: 'bottom-right' },
  /* config options here */
};

export default nextConfig;
