import type { Metadata, Viewport } from "next";
import "@fontsource-variable/figtree";
import "@fontsource-variable/fraunces";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { ToastProvider } from "@/components/toast";
import { ActionProvider } from "@/components/action-provider";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Meu Caixa — gestão sem complicação",
    template: "%s · Meu Caixa",
  },
  description:
    "O jeito mais rápido de registrar vendas, gastos e estoque no seu pequeno negócio. Fricção zero, direto no celular.",
  applicationName: "Meu Caixa",
  authors: [{ name: "Meu Caixa" }],
  keywords: [
    "MEI",
    "gestão financeira",
    "pequenos negócios",
    "controle de estoque",
    "fluxo de caixa",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf6f0",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProvider>
          <ToastProvider>
            <ActionProvider>
              <AppShell>{children}</AppShell>
            </ActionProvider>
          </ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}
