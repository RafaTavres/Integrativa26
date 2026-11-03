import type { NextConfig } from "next";

// A imagem Docker usa a saída `standalone` (definida no Dockerfile). Fora dela
// o build fica no formato padrão, para `npm start` continuar funcionando.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Bibliotecas de IMAP usam sockets/TLS do Node; não devem ser empacotadas
  // no bundle do navegador.
  serverExternalPackages: ["imapflow", "mailparser"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const }
    : {}),
};

export default nextConfig;
