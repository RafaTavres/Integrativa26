import type { Metadata } from "next";
import { StockView } from "@/components/stock-view";

export const metadata: Metadata = {
  title: "Estoque",
};

export default function StockPage() {
  return <StockView />;
}
