import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estokar — gestão sem complicação",
    short_name: "Estokar",
    description:
      "Registre vendas, gastos e estoque do seu pequeno negócio direto no celular.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf6f0",
    theme_color: "#faf6f0",
    lang: "pt-BR",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
