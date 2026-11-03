import { timingSafeEqual } from "node:crypto";
import { parseNfeXml, nfeXmlToImportRows } from "@/lib/nfe-xml";
import { rateLimit, requestKey } from "@/lib/rate-limit";

// Webhook para provedores de e-mail (Postmark, Resend, Cloudflare Email
// Workers, n8n/IMAP). O provedor envia o anexo XML em base64; o endpoint
// valida o segredo, faz o parsing fiscal e devolve as linhas de compra.
//
// A gravação no banco fica no conector que chamou o webhook, para não expor
// uma chave service_role no navegador nem aceitar XML sem autenticação.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BASE64_LENGTH = 4_000_000;

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function receivedSecret(request: Request, body: EmailPayload | null): string {
  const header = request.headers.get("x-webhook-secret");
  if (header) return header;
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return typeof body?.secret === "string" ? body.secret : "";
}

interface EmailAttachment {
  filename?: unknown;
  contentType?: unknown;
  contentBase64?: unknown;
}

interface EmailPayload {
  secret?: unknown;
  businessId?: unknown;
  messageId?: unknown;
  from?: unknown;
  subject?: unknown;
  attachments?: unknown;
}

function isXmlAttachment(attachment: EmailAttachment): boolean {
  const filename =
    typeof attachment.filename === "string"
      ? attachment.filename.toLowerCase()
      : "";
  const contentType =
    typeof attachment.contentType === "string"
      ? attachment.contentType.toLowerCase()
      : "";
  return (
    filename.endsWith(".xml") ||
    contentType.includes("xml")
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(`email:${requestKey(request)}`, 30, 60_000);
  if (!limited.ok) {
    return Response.json(
      { error: "Muitas chamadas em pouco tempo." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const expectedSecret = process.env.EMAIL_INGESTION_SECRET;
  if (!expectedSecret) {
    return Response.json(
      { error: "O recebimento de e-mail não está configurado neste servidor." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as EmailPayload | null;
  if (!body || !sameSecret(receivedSecret(request, body), expectedSecret)) {
    return Response.json({ error: "Webhook não autorizado." }, { status: 401 });
  }

  const attachments = Array.isArray(body.attachments)
    ? (body.attachments as EmailAttachment[])
    : [];
  const xmlAttachment = attachments.find(isXmlAttachment);
  if (!xmlAttachment || typeof xmlAttachment.contentBase64 !== "string") {
    return Response.json(
      { error: "Nenhum anexo XML foi encontrado no e-mail." },
      { status: 422 },
    );
  }
  if (xmlAttachment.contentBase64.length > MAX_BASE64_LENGTH) {
    return Response.json(
      { error: "O anexo XML é grande demais." },
      { status: 413 },
    );
  }

  let xml: string;
  try {
    xml = Buffer.from(xmlAttachment.contentBase64, "base64").toString("utf8");
  } catch {
    return Response.json(
      { error: "Não conseguimos abrir o anexo XML." },
      { status: 422 },
    );
  }

  const data = parseNfeXml(xml);
  if (!data) {
    return Response.json(
      {
        error:
          "O anexo não parece ser o XML de uma NF-e/NFC-e com itens legíveis.",
      },
      { status: 422 },
    );
  }

  return Response.json(
    {
      ok: true,
      businessId:
        typeof body.businessId === "string" ? body.businessId : undefined,
      messageId:
        typeof body.messageId === "string" ? body.messageId : undefined,
      from: typeof body.from === "string" ? body.from : undefined,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      data,
      // O conector pode usar estas linhas no mesmo importador do webapp.
      rows: nfeXmlToImportRows(data),
    },
    {
      status: 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
