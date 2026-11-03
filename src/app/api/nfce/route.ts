import {
  isAllowedNfceUrl,
  parseNfceQrCode,
} from "@/lib/nfce";
import { parseNfceHtml } from "@/lib/nfce-html";
import { rateLimit, requestKey } from "@/lib/rate-limit";

// A consulta é feita no servidor porque o portal da SEFAZ não libera CORS
// para o navegador. A URL só pode apontar para portais fiscais .gov.br.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 2_000_000;

async function fetchNfce(url: string): Promise<Response> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9",
        "user-agent":
          "Mozilla/5.0 (compatible; Estokar/1.0; +https://github.com/RafaTavres/Integrativa26)",
      },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      const next = new URL(location, current);
      if (!isAllowedNfceUrl(next)) {
        throw new RedirectError();
      }
      current = next.toString();
      continue;
    }

    return response;
  }

  throw new RedirectError();
}

class RedirectError extends Error {}

export async function POST(request: Request) {
  const limited = rateLimit(`nfce:${requestKey(request)}`, 20, 60_000);
  if (!limited.ok) {
    return Response.json(
      { error: "Muitas consultas em pouco tempo. Tente de novo em instantes." },
      {
        status: 429,
        headers: { "retry-after": String(limited.retryAfter) },
      },
    );
  }

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
    const response = await fetchNfce(parsed.url);

    if (!response.ok) {
      return Response.json(
        {
          error: `A SEFAZ respondeu com status ${response.status}. Abra a nota no portal e confira manualmente.`,
        },
        { status: 502 },
      );
    }

    const finalUrl = new URL(response.url || parsed.url);
    if (!isAllowedNfceUrl(finalUrl)) {
      return Response.json(
        { error: "A consulta foi redirecionada para um endereço não permitido." },
        { status: 400 },
      );
    }

    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_HTML_BYTES) {
      return Response.json(
        { error: "A página da nota é grande demais para ler agora." },
        { status: 422 },
      );
    }

    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) {
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
    if (error instanceof RedirectError) {
      return Response.json(
        { error: "A consulta foi redirecionada para um endereço não permitido." },
        { status: 400 },
      );
    }
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
