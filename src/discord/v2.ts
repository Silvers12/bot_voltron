import { AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, type ActionRowBuilder, type MessageActionRowComponentBuilder } from 'discord.js';

/** Petits assistants pour les écrans en « composants V2 » (conteneur, titres, séparateurs). */
export const text = (content: string) => new TextDisplayBuilder().setContent(content);
export const divider = (large = false) => new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

export const VOLTRON_COLOR = 0x2e86c1;

/** Un écran = un conteneur coloré (+ lignes de boutons ou menus à l'intérieur), avec le drapeau V2. */
export function screen(container: ContainerBuilder, rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []) {
  for (const row of rows) container.addActionRowComponents(row);
  return { components: [container], flags: MessageFlags.IsComponentsV2 as const };
}

export const card = (color = VOLTRON_COLOR) => new ContainerBuilder().setAccentColor(color);

/** Tronque proprement une liste de lignes pour rester sous la limite de texte d'un message V2. */
export function clampLines(lines: string[], max = 1800): string {
  const out: string[] = [];
  let total = 0;
  for (const l of lines) {
    if (total + l.length + 1 > max) { out.push('…'); break; }
    out.push(l); total += l.length + 1;
  }
  return out.join('\n');
}

/** Écran V2 dont le contenu est une image générée : galerie, texte optionnel sous l'image, lignes de composants. `attachments: []` remplace l'image précédente lors d'une mise à jour. */
export function imageScreen(image: Buffer, name: string, color: number, rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [], { notice, caption }: { notice?: string; caption?: string } = {}) {
  const c = card(color);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${name}`).setDescription(caption ?? name)));
  if (notice) c.addTextDisplayComponents(text(`> ${notice}`));
  return { ...screen(c, rows), files: [new AttachmentBuilder(image, { name })], attachments: [] as never[] };
}
