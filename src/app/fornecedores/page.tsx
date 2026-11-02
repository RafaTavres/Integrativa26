import type { Metadata } from "next";
import { SuppliersView } from "@/components/suppliers-view";

export const metadata: Metadata = {
  title: "Fornecedores",
};

export default function SuppliersPage() {
  return <SuppliersView />;
}
