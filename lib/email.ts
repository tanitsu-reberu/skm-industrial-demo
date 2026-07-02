import "server-only";

type OtpEmailInput = {
  email: string;
  code: string;
  expiresInMinutes: number;
};

export async function sendOtpEmail({ email, code, expiresInMinutes }: OtpEmailInput) {
  if (process.env.RESEND_API_KEY) {
    // Future production hook:
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({ from, to: email, subject, html });
  }

  console.log(`[SKM OTP] ${email}: ${code} (${expiresInMinutes} min)`);
}
