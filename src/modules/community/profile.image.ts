import sharp from 'sharp';
import type { GuildSettings, Member, ShopItem } from '../../generated/prisma/client.js';
import { AVATAR, BANNER_H as H, BANNER_W as W, circleAvatar, esc, FONT } from '../../core/image.js';
import { progressFor } from '../progression/levels.service.js';

const COLOR = '#2e86c1';

export interface ProfileCard {
  member: Member;
  avatarPng: Buffer;
  settings: GuildSettings;
  rank: number;
  title: ShopItem | null;
  badges: number;
  badgesTotal: number;
}

const dateFr = (d: Date, tz: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(d);

/** Bannière 1200 × 400 de la fiche publique : avatar, nom, titre en pastille, ancienneté, niveau avec barre d'XP, rang et badges. */
export async function renderProfileCard({ member, avatarPng, settings, rank, title, badges, badgesTotal }: ProfileCard): Promise<Buffer> {
  const p = progressFor(member.xp, settings);
  const x = 320, barW = 740, barY = 262;
  const name = esc(member.displayName.length > 22 ? `${member.displayName.slice(0, 21)}…` : member.displayName);
  const titleText = title ? esc(title.name.length > 30 ? `${title.name.slice(0, 29)}…` : title.name) : null;
  const since = member.joinedAt ? `Dans la compagnie depuis le ${dateFr(member.joinedAt, settings.timezone)}` : 'Dans la compagnie depuis un moment';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2838"/><stop offset="1" stop-color="${COLOR}" stop-opacity="0.8"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="36" fill="url(#g)"/>
    <circle cx="${40 + AVATAR / 2}" cy="${H / 2}" r="${AVATAR / 2 + 8}" fill="${COLOR}" opacity="0.9"/>
    <text x="${x}" y="92" font-family="${FONT}" font-size="52" font-weight="bold" fill="#fff">${name}</text>
    ${titleText ? `<rect x="${x}" y="112" width="${titleText.length * 14 + 36}" height="40" rx="20" fill="#f1c40f"/><text x="${x + 18}" y="140" font-family="${FONT}" font-size="24" font-weight="bold" fill="#1b2838">${titleText}</text>` : ''}
    <text x="${x}" y="${titleText ? 192 : 150}" font-family="${FONT}" font-size="26" fill="#dfe6ee">${since}</text>
    <text x="${x}" y="${barY - 16}" font-family="${FONT}" font-size="34" font-weight="bold" fill="#fff">Niveau ${p.level}</text>
    <text x="${x + barW}" y="${barY - 16}" text-anchor="end" font-family="${FONT}" font-size="26" fill="#dfe6ee">${rank}ᵉ de la compagnie</text>
    <rect x="${x}" y="${barY}" width="${barW}" height="26" rx="13" fill="#ffffff" opacity="0.22"/>
    <rect x="${x}" y="${barY}" width="${Math.max(26, Math.round((barW * p.current) / p.needed))}" height="26" rx="13" fill="#f1c40f"/>
    <text x="${x}" y="${barY + 56}" font-family="${FONT}" font-size="22" fill="#eef3f7">${p.current} / ${p.needed} XP vers le niveau ${p.level + 1} · ${member.xp} XP au total</text>
    <text x="${x}" y="${barY + 96}" font-family="${FONT}" font-size="22" fill="#eef3f7">${badges} badge${badges > 1 ? 's' : ''} sur ${badgesTotal}</text>
  </svg>`;
  const avatar = await circleAvatar(avatarPng);
  return sharp(Buffer.from(svg)).composite([{ input: avatar, left: 40, top: (H - AVATAR) / 2 }]).png().toBuffer();
}
