import type { NextConfig } from "next";

// A imagem Docker usa a saída `standalone` (definida no Dockerfile). Fora dela
// o build fica no formato padrão, para `npm start` continuar funcionando.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const }
    : {}),
};

export default nextConfig;
