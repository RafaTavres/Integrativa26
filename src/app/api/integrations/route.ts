import { INGESTION_CONTRACT } from "@/lib/ingestion";

// Contrato público para os conectores futuros (WhatsApp, e-mail/XML, QR Code).
// Não expõe dados nem chaves: só descreve o formato aceito.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(INGESTION_CONTRACT, {
    headers: { "cache-control": "no-store, no-cache, must-revalidate" },
  });
}
