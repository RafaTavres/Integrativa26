import {
  isAllowedNfceUrl,
  parseNfceQrCode,
} from "@/lib/nfce";
import { parseNfceHtml } from "@/lib/nfce-html";

// A consulta é feita no servidor porque o portal da SEFAZ não libera CORS
// para o navegador. A URL só pode apontar para portais fiscais .gov.br.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
  } | null;
  const rawUrl = typeof body?.url === "string" ? body.url : "";
  const parsed = parseNfceQrCode(rawUrl);

  if (!parsed) {
    return Response.json(
      { error: "Este QR Code não é uma consulta de NFC-e reconhecida." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(parsed.url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9",
        "user-agent":
          "Mozilla/5.0 (compatible; Estokar/1.0; +https://github.com/RafaTavres/Integrativa26)",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return Response.json(
        {
          error: `A SEFAZ respondeu com status ${response.status}. Abra a nota no portal e confira manualmente.`,
        },
        { status: 502 },
      );
    }

    const finalUrl = new URL(response.url);
    if (!isAllowedNfceUrl(finalUrl)) {
      return Response.json(
        { error: "A consulta foi redirecionada para um endereço não permitido." },
        { status: 400 },
      );
    }

    const html = await response.text();
    if (html.length > 2_000_000) {
      return Response.json(
        { error: "A página da nota é grande demais para ler agora." },
        { status: 422 },
      );
    }

    const data = parseNfceHtml(html, parsed.url);
    if (!data) {
      return Response.json(
        {
          error:
            "Consultamos a nota, mas os itens não apareceram na página. Confira a leitura da foto ou abra a nota na SEFAZ.",
        },
        { status: 422 },
      );
    }

    return Response.json(
      { ...data, key: parsed.key },
      {
        status: 200,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    const timeout =
      error instanceof DOMException && error.name === "TimeoutError";
    return Response.json(
      {
        error: timeout
          ? "A SEFAZ demorou para responder. Tente de novo ou confira a foto."
          : "Não conseguimos consultar a SEFAZ agora. Confira a leitura da foto.",
      },
      { status: 502 },
    );
  }
}
