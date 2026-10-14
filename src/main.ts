import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';

interface MapDetails {
  map_id: 1;
  name: string;
  description: string;
  creator_name: string;
  votes: 1;
  gameplays: 1;
  playtime: 1;
  featured: true;
  category: 1;
  created_at: string;
  updated_at: string;
  leaderboard_type: string;
  leaderboard_order: 0;
}

const app = express();
const port = process.env.PORT || '3000';

function verify(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return parts.v1?.length === expected.length && timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

async function getMapDetails(name: string): Promise<MapDetails> {
  const res = await fetch(`https://gapi.svc.krunker.io/api/map/${name}`, {
    headers: { 'X-Developer-API-Key': process.env.KRUNKER_API_KEY! } 
  });
  return res.json();
}

async function sendNotif(data: MapDetails) {
  const payload = {
    'username': 'MMOK',
    'avatar_url': 'https://cdn.discordapp.com/avatars/1550020685869359177/9214bbb4eb6dd051005f985dea1e2ae3.webp?size=1024',
    'flags': 32768,
    'components': [
      {
        'type': 17,
        'accent_color': 15990528,
        'components': [
          { 'type': 10, 'content': `## ${data.name} has been featured!\n<t:${Date.now()}:f>` },
          { 'type': 14, 'divider': true, 'spacing': 2 },
          { 'type': 10, 'content': data.description },
          { 'type': 14, 'divider': true, 'spacing': 2 },
          { 'type': 10, 'content': 'Game Links: <hub> | <play>' },
          { 'type': 12, 'items': [{ 'media': { 'url': `https://user-assets.krunker.io/m${data.map_id}/thumb.png` } }] },
          { 'type': 14, 'divider': true, 'spacing': 2 },
          { 'type': 10, 'content': `Name: ${data.name} | Creator: ${data.creator_name} | Plays: ${data.gameplays} | Likes: ${data.votes}` }
        ]
      }
    ]
  }

  const res = await fetch(process.env.DISCORD_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

app.post('/webhooks/krunker', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.header('Krunker-Signature');
    const secret = process.env.WEBHOOK_SECRET;

    if (!signature || !secret) return res.sendStatus(400);

    const raw = req.body.toString('utf8');

    if (!verify(raw, signature, secret)) return res.sendStatus(401);

    const event = JSON.parse(raw);
    const mapDetails = await getMapDetails(event.data.map_name);
    sendNotif(mapDetails);

    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(400);
    throw new Error(`${err}`);
  }
});

app.listen(port);