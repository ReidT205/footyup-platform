export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface Mailer {
  readonly mode: "brevo" | "log" | "memory";
  send(message: OutgoingEmail): Promise<void>;
}

export class BrevoMailer implements Mailer {
  readonly mode = "brevo" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: { email: string; name: string },
  ) {}

  async send(message: OutgoingEmail): Promise<void> {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: this.from,
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
        ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Brevo send failed with status ${res.status}`);
  }
}

/** Used until Brevo exists. Logs the subject only, never the body (it can hold personal data). */
export class LogMailer implements Mailer {
  readonly mode = "log" as const;

  async send(message: OutgoingEmail): Promise<void> {
    console.info(JSON.stringify({ level: "info", scope: "email", note: "BREVO_API_KEY not set; email not sent", subject: message.subject }));
  }
}

export class MemoryMailer implements Mailer {
  readonly mode = "memory" as const;
  readonly sent: OutgoingEmail[] = [];

  async send(message: OutgoingEmail): Promise<void> {
    this.sent.push(message);
  }
}
