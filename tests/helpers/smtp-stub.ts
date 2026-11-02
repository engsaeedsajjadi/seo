/** Minimal SMTP server for tests. Speaks the real protocol, so the app's mail client runs unmodified. */
import { createServer, type Server } from 'node:net';

export interface CapturedMail { to: string; raw: string }

export function startSmtpStub(port: number): { server: Server; mails: CapturedMail[] } {
  const mails: CapturedMail[] = [];
  const server = createServer((socket) => {
    let to = '';
    let inData = false;
    let data = '';
    socket.write('220 stub ESMTP\r\n');
    socket.on('data', (chunk) => {
      const text = chunk.toString();
      if (inData) {
        data += text;
        if (data.endsWith('\r\n.\r\n')) {
          inData = false;
          mails.push({ to, raw: data });
          data = '';
          socket.write('250 OK\r\n');
        }
        return;
      }
      for (const line of text.split('\r\n').filter(Boolean)) {
        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) socket.write('250 stub\r\n');
        else if (upper.startsWith('MAIL FROM')) socket.write('250 OK\r\n');
        else if (upper.startsWith('RCPT TO')) { to = line.replace(/^.*<|>.*$/g, ''); socket.write('250 OK\r\n'); }
        else if (upper === 'DATA') { inData = true; socket.write('354 go\r\n'); }
        else if (upper === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 OK\r\n');
      }
    });
    socket.on('error', () => {});
  });
  server.listen(port, '127.0.0.1');
  return { server, mails };
}

/** Mail clients pick quoted-printable or base64 by content; both are undone before searching for a link's token. */
export function findToken(mail: CapturedMail): string | undefined {
  const flat = mail.raw.replace(/=\r\n/g, '').replace(/=3D/g, '=');
  const body = flat.split('\r\n\r\n').slice(1).join('\n');
  const decoded = Buffer.from(body.replace(/\s|\.$/g, ''), 'base64').toString('utf8');
  return (flat.match(/token=([0-9a-f]{64})/) || decoded.match(/token=([0-9a-f]{64})/))?.[1];
}
