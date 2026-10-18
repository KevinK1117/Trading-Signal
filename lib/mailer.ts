
import 'server-only';
import nodemailer from 'nodemailer';

type SignalEmail = {
  symbol: string;
  timeframe: 'M15' | 'M30';
  side: 'LONG' | 'SHORT';
  broker: string;
  lots: number;
  entry: number;
  sl: number;
  tp2: number;
  tp3: number;
  tp4: number;
  signalTime: string;
};

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const recipient = process.env.ALERT_EMAIL;

  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !password ||
    !recipient
  ) {
    throw new Error(
      'GMX-E-Mail-Einstellungen in Vercel fehlen.'
    );
  }

  return { host, port, user, password, recipient };
}

export async function sendSignalEmail(
  signal: SignalEmail
) {
  const config = getMailConfig();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: {
      user: config.user,
      pass: config.password
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });

  const subject =
    `SignalDesk: ${signal.side} ${signal.symbol} ` +
    `${signal.timeframe}`;

  const text = [
    'SIGNALDESK – NEUES TRADING-SIGNAL',
    '',
    `Markt: ${signal.symbol}`,
    `Zeitrahmen: ${signal.timeframe}`,
    `Richtung: ${signal.side}`,
    `Broker: ${signal.broker}`,
    `Positionsgröße: ${signal.lots} Lot`,
    '',
    `Entry: ${signal.entry}`,
    `Stop-Loss: ${signal.sl}`,
    `Take-Profit 1:2: ${signal.tp2}`,
    `Take-Profit 1:3: ${signal.tp3}`,
    `Take-Profit 1:4: ${signal.tp4}`,
    '',
    'Geplantes Kursrisiko: ungefähr 5 EUR',
    `Signalkerze: ${signal.signalTime}`,
    '',
    'Hinweis: Spread, Kommission, Slippage und',
    'abweichende Brokerkurse können das tatsächliche',
    'Risiko verändern. Keine Anlageberatung.'
  ].join('\n');

  const result = await transporter.sendMail({
    from: {
      name: 'SignalDesk',
      address: config.user
    },
    to: config.recipient,
    subject,
    text
  });

  if (!result.accepted.includes(config.recipient)) {
    throw new Error(
      'Der E-Mail-Server hat den Empfänger ' +
      'nicht bestätigt.'
    );
  }

  return {
    messageId: result.messageId
  };
}
