import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';

const app = express();
const port = process.env.PORT || '3000';

console.log(process.env);

function verify(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return parts.v1?.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

app.post('/webhooks/krunker', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.header('Krunker-Signature');
  const secret = process.env.WEBHOOK_SECRET;

  if (!signature || !secret) return res.sendStatus(400);

  const raw = req.body.toString('utf8');

  if (!verify(raw, signature, secret)) return res.sendStatus(401);

  const event = JSON.parse(raw);
  console.log(event);

  res.sendStatus(200);
});

app.listen(port);