import type { Metadata } from "next";
import { WhatsappView } from "@/components/whatsapp-view";

export const metadata: Metadata = {
  title: "WhatsApp",
};

export default function WhatsappPage() {
  return <WhatsappView />;
}
