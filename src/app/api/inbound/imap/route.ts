import { timingSafeEqual } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createClient } from "@supabase/supabase-js";
import { parseNfeXml, nfeXmlToImportRows } from "@/lib/nfe-xml";
import { rateLimit, requestKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function imapConfig() {
  const host = process.env.EMAIL_IMAP_HOST?.trim();
  const user = process.env.EMAIL_IMAP_USER?.trim();
  const pass = process.env.EMAIL_IMAP_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.EMAIL_IMAP_PORT ?? "993");
  const secure = (process.env.EMAIL_IMAP_SECURE ?? "true") !== "false";
  const mailbox = process.env.EMAIL_IMAP_MAILBOX?.trim() || "INBOX";
  return { host, port: Number.isFinite(port) ? port : 993, secure, user, pass, mailbox };
}

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function GET() {
  const config = imapConfig();
  return Response.json({
    configured: Boolean(config),
    storage: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.EMAIL_IMAP_BUSINESS_ID,
    ),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(`imap:${requestKey(request)}`, 5, 60_000);
  if (!limited.ok) {
    return Response.json(
      { error: "Muitas execuções em pouco tempo." },
      { status: 429, headers: { "retry-after": String(limited.retryAfter) } },
    );
  }

  const expectedSecret = process.env.EMAIL_INGESTION_SECRET;
  if (!expectedSecret) {
    return Response.json(
      { error: "O conector de e-mail não está configurado." },
      { status: 503 },
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  const received = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!sameSecret(received, expectedSecret)) {
    return Response.json({ error: "Webhook não autorizado." }, { status: 401 });
  }

  const config = imapConfig();
  if (!config) {
    return Response.json(
      { error: "Configure EMAIL_IMAP_HOST, EMAIL_IMAP_USER e EMAIL_IMAP_PASSWORD." },
      { status: 503 },
    );
  }

  const businessId = process.env.EMAIL_IMAP_BUSINESS_ID?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!businessId || !serviceKey || !supabaseUrl) {
    // Sem storage o worker não pode marcar e-mails como lidos: isso perderia
    // os XMLs. Melhor falhar de forma explícita.
    return Response.json(
      {
        error:
          "Configure SUPABASE_SERVICE_ROLE_KEY e EMAIL_IMAP_BUSINESS_ID para gravar os e-mails.",
      },
      { status: 503 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  let checked = 0;
  let parsed = 0;
  let stored = 0;
  const errors: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      for await (const message of client.fetch(
        { seen: false },
        { source: true, uid: true },
      )) {
        if (checked >= 50) break;
        checked += 1;
        if (!message.source) continue;

        let mail;
        try {
          mail = await simpleParser(message.source);
        } catch {
          errors.push(`E-mail ${message.uid}: não foi possível abrir.`);
          continue;
        }

        const xmlAttachments = mail.attachments.filter((attachment) => {
          const filename = attachment.filename?.toLowerCase() ?? "";
          const contentType = attachment.contentType?.toLowerCase() ?? "";
          return filename.endsWith(".xml") || contentType.includes("xml");
        });

        if (xmlAttachments.length === 0) {
          await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
          continue;
        }

        let parsedAttachments = 0;
        let storedAttachments = 0;

        for (const attachment of xmlAttachments) {
          const data = parseNfeXml(attachment.content.toString("utf8"));
          if (!data) continue;
          parsed += 1;
          parsedAttachments += 1;

          const { error } = await supabase.from("ingestion_events").insert({
            business_id: businessId,
            source_type: "email_import",
            status: "pending_review",
            raw_input: `E-mail de ${mail.from?.text ?? "fornecedor"} · ${
              mail.subject ?? "sem assunto"
            }`,
            extracted_payload: {
              xml: attachment.content.toString("utf8"),
              from: mail.from?.text,
              subject: mail.subject,
              rows: nfeXmlToImportRows(data),
            },
            external_channel: "email",
            external_id: mail.messageId ?? `imap-${message.uid}`,
          });

          if (error && error.code !== "23505") {
            errors.push(`E-mail ${message.uid}: ${error.message}`);
          } else {
            stored += 1;
            storedAttachments += 1;
          }
        }

        // Só marca como lido quando todos os XMLs foram lidos e gravados.
        // Se o banco falhar, o e-mail volta na próxima execução.
        if (
          parsedAttachments === xmlAttachments.length &&
          storedAttachments === parsedAttachments
        ) {
          await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? `Falha ao ler a caixa de e-mail: ${error.message}`
            : "Falha ao ler a caixa de e-mail.",
      },
      { status: 502 },
    );
  } finally {
    await client.logout().catch(() => undefined);
  }

  return Response.json(
    {
      ok: true,
      checked,
      parsed,
      stored,
      errors,
      storage: "supabase",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
