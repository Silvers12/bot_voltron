import { ContainerBuilder, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, type ActionRowBuilder, type MessageActionRowComponentBuilder } from 'discord.js';

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
