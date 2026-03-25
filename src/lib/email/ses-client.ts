/**
 * BOT SPACE - AWS SES EMAIL CLIENT
 * "Bulletproof, Concrete, Rebar, and Steel"
 *
 * Sends transactional emails via Amazon SES.
 * Built for scale: 1 billion users, zero compromises.
 *
 * @author PAULIEWOOD! & The Power Trio
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@spacebot.space';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email via AWS SES
 */
export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const command = new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
        },
      },
    });

    const result = await sesClient.send(command);
    console.log('[EMAIL] Sent to:', to, 'MessageId:', result.MessageId);

    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error('[EMAIL] Failed to send to:', to, 'Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown email error' };
  }
}
