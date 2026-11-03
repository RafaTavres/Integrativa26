import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createClient } from "@supabase/supabase-js";
import { parseNfeXml, nfeXmlToImportRows } from "@/lib/nfe-xml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function maskEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 2)}***@${domain}`;
}

export function GET() {
  const config = imapConfig();
  return Response.json({
    configured: Boolean(config),
    user: config ? maskEmail(config.user) : undefined,
    mailbox: config?.mailbox,
    storage: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.EMAIL_IMAP_BUSINESS_ID,
    ),
  });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.EMAIL_INGESTION_SECRET;
  if (!expectedSecret) {
    return Response.json(
      { error: "O conector de e-mail não está configurado." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
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
  const canStore = Boolean(businessId && serviceKey && supabaseUrl);
  const supabase = canStore
    ? createClient(supabaseUrl!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

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

  await client.connect();
  const lock = await client.getMailboxLock(config.mailbox);
  try {
    for await (const message of client.fetch(
      { seen: false },
      { source: true, uid: true },
    )) {
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

      let messageParsed = false;
      for (const attachment of xmlAttachments) {
        const xml = attachment.content.toString("utf8");
        const data = parseNfeXml(xml);
        if (!data) continue;
        parsed += 1;
        messageParsed = true;

        if (!supabase || !businessId) continue;
        const { error } = await supabase.from("ingestion_events").insert({
          business_id: businessId,
          source_type: "email_import",
          status: "pending_review",
          raw_input: `E-mail de ${mail.from?.text ?? "fornecedor"} · ${
            mail.subject ?? "sem assunto"
          }`,
          extracted_payload: {
            xml,
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
        }
      }

      if (messageParsed || xmlAttachments.length === 0) {
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }

  return Response.json(
    {
      ok: true,
      checked,
      parsed,
      stored,
      errors,
      storage: canStore
        ? "supabase"
        : "configure SUPABASE_SERVICE_ROLE_KEY e EMAIL_IMAP_BUSINESS_ID para gravar",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
