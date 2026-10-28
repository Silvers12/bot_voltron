import sharp from 'sharp';
import { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, type ContainerBuilder, type MessageFlags } from 'discord.js';
import { BANNER_W as W, esc, FONT } from '../core/image.js';

const H = 170;

export interface Header {
  title: string;
  subtitle?: string;
  /** Couleur d'accent (hex CSS) */
  color: string;
}

/** Bandeau 1200 × 170 : dégradé sombre vers la couleur, titre et sous-titre, ornements discrets. */
export async function renderHeader({ title, subtitle, color }: Header): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b2838"/><stop offset="1" stop-color="${color}" stop-opacity="0.85"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" rx="30" fill="url(#g)"/>
    <circle cx="${W - 120}" cy="${H / 2}" r="130" fill="#fff" opacity="0.06"/>
    <circle cx="${W - 40}" cy="${H - 20}" r="70" fill="#fff" opacity="0.06"/>
    <rect x="48" y="${H / 2 - 40}" width="10" height="80" rx="5" fill="${color}"/>
    <text x="84" y="${subtitle ? 78 : H / 2 + 18}" font-family="${FONT}" font-size="50" font-weight="bold" fill="#fff">${esc(title)}</text>
    ${subtitle ? `<text x="86" y="122" font-family="${FONT}" font-size="26" fill="#dfe6ee">${esc(subtitle)}</text>` : ''}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

type Screen = { components: ContainerBuilder[]; flags: MessageFlags.IsComponentsV2 };

/** Insère le bandeau en tête du conteneur d'un écran V2 et joint l'image ; `attachments: []` remplace l'ancien bandeau lors d'une mise à jour. */
export async function withHeader<T extends Screen>(payload: T, header: Header) {
  const image = await renderHeader(header);
  payload.components[0]!.spliceComponents(0, 0, new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://entete.png').setDescription(header.title)));
  return { ...payload, files: [new AttachmentBuilder(image, { name: 'entete.png' })], attachments: [] as never[] };
}
