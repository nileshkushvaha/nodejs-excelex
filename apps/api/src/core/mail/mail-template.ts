/**
 * The one email layout, and the pieces a template supplies.
 *
 * Every message the platform sends — a password reset, a lockout notice, a
 * test — is a title, some paragraphs, an optional button and a footer, in
 * one visual shell. One layout means one place to get the dark-mode colours
 * and the plain-text fallback right, and every message reads as coming from
 * the same system. Templates never write HTML; they hand over text, and the
 * text is escaped here.
 */
export interface MailContent {
  readonly subject: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly cta?: { label: string; url: string };
  /** A line under the button, e.g. "This link expires in 15 minutes." */
  readonly note?: string;
  /** Who it appears from, for the footer: the client's trading name. */
  readonly senderName: string;
}

export interface RenderedMail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export function renderMail(content: MailContent): RenderedMail {
  const paragraphs = content.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escape(p)}</p>`).join("");
  const cta = content.cta
    ? `<p style="margin:22px 0"><a href="${escapeAttribute(content.cta.url)}" style="display:inline-block;background:#2f5bea;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px">${escape(content.cta.label)}</a></p>` +
      `<p style="margin:0 0 14px;font-size:12px;color:#667085;line-height:1.5">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${escape(content.cta.url)}</span></p>`
    : "";
  const note = content.note ? `<p style="margin:0 0 14px;font-size:13px;color:#667085">${escape(content.note)}</p>` : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101828">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e4e7ec">
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escape(content.title)}</h1>${paragraphs}${cta}${note}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #eef0f4;font-size:12px;color:#98a2b3">Sent by ${escape(content.senderName)}. Please do not reply to this address.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    content.title,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ""] : []),
    ...(content.note ? [content.note, ""] : []),
    `— ${content.senderName}`,
  ].join("\n");

  return { subject: content.subject, html, text };
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function escapeAttribute(value: string): string {
  return escape(value);
}
