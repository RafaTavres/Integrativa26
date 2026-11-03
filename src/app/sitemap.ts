import type { MetadataRoute } from "next";

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://estokar-nu.vercel.app";

const routes = [
  { path: "/", priority: 1 },
  { path: "/estoque", priority: 0.8 },
  { path: "/contas", priority: 0.8 },
  { path: "/fornecedores", priority: 0.7 },
  { path: "/analises", priority: 0.7 },
  { path: "/importar", priority: 0.6 },
  { path: "/integracoes", priority: 0.5 },
  { path: "/whatsapp", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route.priority,
  }));
}
