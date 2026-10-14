import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';

interface MapDetails {
  map_id: number;
  name: string;
  description: string;
  creator_name: string;
  votes: number;
  gameplays: number;
  playtime: number;
  featured: boolean;
  category: number;
  created_at: string;
  updated_at: string;
  leaderboard_type: string;
  leaderboard_order: number;
}

const app = express();
const port = process.env.PORT || '3000';

function verify(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=')));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  if (typeof parts.v1 !== 'string') return false;

  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function resolveThumb(mapId: number): Promise<string> {
  const url = `https://user-assets.krunker.io/m${mapId}/thumb.png`;
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) return url;
  } catch {}
  return `https://krunker.io/img/noimg.png`;
}

async function getMapDetails(name: string): Promise<MapDetails> {
  const res = await fetch(`https://gapi.svc.krunker.io/api/map/${encodeURIComponent(name)}`, {
    headers: { 'X-Developer-API-Key': process.env.KRUNKER_API_KEY! },
  });
  if (!res.ok) throw new Error(`Krunker API ${res.status}`);
  return res.json() as Promise<MapDetails>;
}

async function sendNotif(data: MapDetails) {
  const thumb = await resolveThumb(data.map_id);
  const payload = {
    username: 'MMOK',
    avatar_url: 'https://cdn.discordapp.com/avatars/1550020685869359177/9214bbb4eb6dd051005f985dea1e2ae3.webp?size=1024',
    flags: 32768,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: 15990528,
        components: [
          { type: 10, content: `## ${data.name} has been featured!\n<t:${Math.floor(Date.now() / 1000)}:f>` },
          { type: 14, divider: true, spacing: 2 },
          { type: 10, content: data.description?.trim() || 'No description.' },
          { type: 14, divider: true, spacing: 2 },
          { type: 10, content: `Game Links: [Hub](https://krunker.io/social.html?p=map&q=${encodeURIComponent(data.name)}) | [Play](https://krunker.io/?play=${encodeURIComponent(data.name)})` },
          { type: 12, items: [{ media: { url: thumb } }] },
          { type: 14, divider: true, spacing: 2 },
          { type: 10, content: `Name: ${data.name} | Creator: ${data.creator_name} | Plays: ${data.gameplays} | Likes: ${data.votes}` },
        ],
      },
    ],
  };

  const url = new URL(process.env.DISCORD_WEBHOOK_URL!);
  url.searchParams.set('with_components', 'true');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Discord ${res.status} ${await res.text()}`);
}

app.post('/webhooks/krunker', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.header('Krunker-Signature');
  const secret = process.env.WEBHOOK_SECRET;
  if (!signature || !secret) return res.sendStatus(400);

  const raw = req.body.toString('utf8');
  if (!verify(raw, signature, secret)) return res.sendStatus(401);

  try {
    const event = JSON.parse(raw);
    const mapDetails = await getMapDetails(event.data.map_name);
    await sendNotif(mapDetails);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(port);