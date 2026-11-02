import type { Metadata } from "next";
import { IntegrationsView } from "@/components/integrations-view";

export const metadata: Metadata = {
  title: "Integrações",
};

export default function IntegrationsPage() {
  return <IntegrationsView />;
}
