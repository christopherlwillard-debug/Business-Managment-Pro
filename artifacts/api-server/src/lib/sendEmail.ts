import { ReplitConnectors } from "@replit/connectors-sdk";

function base64UrlEncode(input: string | Buffer): string {
  const bytes = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  base64Data: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachment?: EmailAttachment;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const { to, subject, html, text, attachment } = opts;

  const safeToHeader = sanitizeHeader(to);
  const safeSubject = sanitizeHeader(subject);

  if (!EMAIL_RE.test(safeToHeader)) {
    throw new Error(`sendEmail: invalid recipient address: "${safeToHeader}"`);
  }

  const boundary = `==BP${Date.now()}==`;
  const rfcLines: string[] = [];

  if (attachment) {
    const outerBoundary = `==OUTER${Date.now()}==`;

    rfcLines.push(
      `To: ${safeToHeader}`,
      `Subject: ${safeSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
      ``,
      `--${outerBoundary}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      text ?? html.replace(/<[^>]+>/g, ""),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      html,
      ``,
      `--${boundary}--`,
      ``,
      `--${outerBoundary}`,
      `Content-Type: ${attachment.mimeType}; name="${sanitizeHeader(attachment.filename)}"`,
      `Content-Disposition: attachment; filename="${sanitizeHeader(attachment.filename)}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      attachment.base64Data.match(/.{1,76}/g)?.join("\r\n") ?? attachment.base64Data,
      ``,
      `--${outerBoundary}--`,
    );
  } else {
    rfcLines.push(
      `To: ${safeToHeader}`,
      `Subject: ${safeSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      text ?? html.replace(/<[^>]+>/g, ""),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      html,
      ``,
      `--${boundary}--`,
    );
  }

  const raw = base64UrlEncode(rfcLines.join("\r\n"));

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail send failed (${response.status}): ${body}`);
  }
}

export { escapeHtml };
