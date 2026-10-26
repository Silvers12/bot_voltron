import { MessageFlags, channelMention, roleMention, type ChatInputCommandInteraction, type Guild, type RepliableInteraction } from 'discord.js';
import { prisma } from '../../infrastructure/prisma.js';
import { isBotAdmin } from '../../core/permissions.js';
import { registerButton, registerButtonPrefix, registerSelect, type ButtonContext, type SelectContext } from '../../discord/components.js';
import { closeSession, openSession, touchSession } from '../../discord/sessions.js';
import { formatAmount, getSettings } from '../settings/settings.service.js';
import { FEATURE_KEYS, featureInfo, isFeatureEnabled, setEnabledFeatures, setFeatureEnabled, type FeatureKey } from '../features/features.js';
import { getJackpot } from '../casino/slots.service.js';
import { listItems } from '../shop/shop.service.js';
import { listLevelRoles } from '../progression/levels.service.js';
import { reconcileVoiceSessions } from '../progression/xp.service.js';
import { getOpenHug, scheduleNext } from '../events/grouphug.service.js';
import { describeLottery } from '../lottery/lottery.admin.js';
import {
  ADMIN_CLOSE_ID, ADMIN_FEATURES_SELECT_ID, ADMIN_HOME_ID, ADMIN_MODULE_PREFIX, ADMIN_MODULE_SELECT_ID, ADMIN_REFRESH_ID, ADMIN_TOGGLE_PREFIX,
  buildClosedView, buildHomeView, buildModuleView, moduleInfo, MODULES, type ModuleDetails, type ModuleKey, type Overview,
} from './panel.view.js';

const TTL_MS = 5 * 60 * 1000;
const key = (guildId: string, userId: string) => `admin:${guildId}:${userId}`;
const DAYS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Ouvre le panneau d'intendance (éphémère) ; un seul panneau par administrateur. */
export async function openAdminPanel(interaction: ChatInputCommandInteraction<'cached'>) {
  const k = key(interaction.guildId, interaction.user.id);
  await closeSession(k);
  await interaction.reply({ ...(await renderHome(interaction.guildId)), flags: MessageFlags.Ephemeral });
  await openSession(k, interaction, TTL_MS, expire);
}

async function expire(interaction: RepliableInteraction) {
  await interaction.editReply(buildClosedView()).catch(() => undefined);
}

async function overview(guildId: string): Promise<Overview> {
  const [members, accounts, totals, jackpot, lottery, openHug, pendingDuels, activeGames, s] = await Promise.all([
    prisma.member.count({ where: { guildId, leftAt: null } }),
    prisma.account.count({ where: { member: { guildId } } }),
    prisma.account.aggregate({ where: { member: { guildId } }, _sum: { balance: true }, _max: { balance: true } }),
    getJackpot(guildId),
    prisma.lottery.findFirst({ where: { guildId, state: 'OPEN' } }),
    getOpenHug(guildId),
    prisma.duel.count({ where: { guildId, state: 'PENDING' } }),
    prisma.blackjackGame.count({ where: { state: 'PLAYING', member: { guildId } } }),
    getSettings(guildId),
  ]);
  return {
    members, accounts,
    circulation: totals._sum.balance ?? 0,
    richest: totals._max.balance ?? 0,
    slotPool: jackpot.pool,
    lottery: lottery && s.lotteryChannelId ? { pot: lottery.pot, tickets: lottery.totalTickets, drawAt: lottery.drawAt } : null,
    nextHug: s.groupHugChannelIds.length ? s.nextGroupHugAt : null,
    openHug: openHug !== null,
    pendingDuels, activeGames,
  };
}

async function renderHome(guildId: string, notice?: string) {
  const [s, o] = await Promise.all([getSettings(guildId), overview(guildId)]);
  return buildHomeView(s, o, notice);
}

async function moduleDetails(guild: Guild, module: ModuleKey): Promise<ModuleDetails> {
  const s = await getSettings(guild.id);
  switch (module) {
    case 'economie':
      return {
        lines: [
          `Monnaie : ${s.currencySingular} / ${s.currencyPlural} ${s.currencySymbol}`,
          `Bourse de bienvenue : ${formatAmount(s.startingBalance, s)}`,
          `Récompense du jour : ${formatAmount(s.dailyAmount, s)} (+${s.dailyStreakBonusPercent} % par jour de série)`,
          `Récompense de la semaine : ${formatAmount(s.weeklyAmount, s)}`,
          `Fuseau : ${s.timezone}`,
        ],
        commands: ['/admin monnaie', '/admin bienvenue', '/admin quotidien', '/admin hebdo', '/admin crediter · debiter · solde'],
      };
    case 'progression': {
      const roles = await listLevelRoles(guild.id);
      return {
        lines: [
          `XP par message : ${s.xpPerMessage} (délai ${s.xpMessageCooldownSeconds} s)`,
          `XP vocal : ${s.xpPerVoiceInterval} par tranche de ${s.voiceIntervalMinutes} min`,
          `Courbe : ${s.levelBaseXp} + ${s.levelStepXp} × niveau`,
          `Annonces de niveau : ${s.levelUpChannelId ? channelMention(s.levelUpChannelId) : 'aucune'}`,
          `Rôles de palier : ${roles.length ? roles.map((r) => `niv. ${r.level} → ${roleMention(r.roleId)}`).join(', ') : 'aucun'}`,
        ],
        commands: ['/admin xp', '/admin niveaux courbe · salon · role · retirer · liste · resync'],
      };
    }
    case 'boutique': {
      const items = await listItems(guild.id, { includeInactive: true });
      const active = items.filter((i) => i.active);
      return {
        lines: [
          `Articles en vente : ${active.length} (${items.length - active.length} retiré(s))`,
          ...active.slice(0, 10).map((i) => `• ${i.name} · ${formatAmount(i.price, s)}${i.kind === 'ROLE' ? ' · rôle' : ''}${i.stock !== null ? ` · stock ${i.stock}` : ''}`),
          ...(active.length > 10 ? [`… et ${active.length - 10} autre(s)`] : []),
        ],
        commands: ['/admin boutique ajouter · modifier · retirer · liste'],
      };
    }
    case 'casino': {
      const jackpot = await getJackpot(guild.id);
      return {
        lines: [
          `Blackjack : mises de ${formatAmount(s.blackjackMinBet, s)} à ${formatAmount(s.blackjackMaxBet, s)}`,
          `Machine : ${formatAmount(s.slotBet, s)} le tour · triple = ${s.slotTriplePercent} % de la cagnotte · départ ${formatAmount(s.slotJackpotSeed, s)}`,
          `Cagnotte actuelle : ${formatAmount(jackpot.pool, s)}`,
        ],
        commands: ['/admin blackjack', '/admin machine'],
      };
    }
    case 'duel':
      return { lines: [`Mises de ${formatAmount(s.duelMinStake, s)} à ${formatAmount(s.duelMaxStake, s)}`], commands: ['/admin duel'] };
    case 'calin_collectif':
      return {
        lines: [
          `Salons : ${s.groupHugChannelIds.length ? s.groupHugChannelIds.map(channelMention).join(' ') : 'aucun (inactif)'}`,
          `Récompense : ${formatAmount(s.groupHugReward, s)} par câlineur · durée ${s.groupHugDurationSeconds} s`,
          `Intervalle : ${s.groupHugMinIntervalMinutes} à ${s.groupHugMaxIntervalMinutes} min`,
          `Prochaine apparition : ${s.nextGroupHugAt && s.groupHugChannelIds.length ? `<t:${Math.floor(s.nextGroupHugAt.getTime() / 1000)}:R>` : 'non programmée'}`,
        ],
        commands: ['/admin calin salon · regler · lancer'],
      };
    case 'tombola':
      return {
        lines: describeLottery(s, await prisma.lottery.findFirst({ where: { guildId: guild.id, state: 'OPEN' } })).split('\n'),
        commands: ['/admin tombola salon · regler · publier · tirer · etat'],
      };
    case 'textes':
      return {
        lines: ['Textes dans `content/compliments.json` et `content/insultes.json` (rechargés au redémarrage)'],
        commands: ['Modifier les fichiers puis redémarrer le bot'],
      };
  }
}

async function renderModule(guild: Guild, module: ModuleKey, notice?: string) {
  const s = await getSettings(guild.id);
  return buildModuleView(s, moduleInfo(module), await moduleDetails(guild, module), notice);
}

/** Effets de bord d'un changement d'état : reprise des sessions vocales, replanification des câlins. */
async function afterToggle(guild: Guild, changed: FeatureKey[], enabledNow: (k: FeatureKey) => boolean) {
  if (changed.includes('xp') && enabledNow('xp')) await reconcileVoiceSessions(guild);
  if (changed.includes('calin_collectif') && enabledNow('calin_collectif')) await scheduleNext(guild.id);
}

function describeChange(changed: FeatureKey[], enabledNow: (k: FeatureKey) => boolean): string | undefined {
  if (!changed.length) return undefined;
  return changed.map((k) => `${enabledNow(k) ? '🟢 activé' : '⛔ désactivé'} : ${featureInfo(k).label}`).join('\n');
}

// ---------------------------------------------------------------------------
// Composants : réservés aux administrateurs, chaque action repousse l'expiration.
// ---------------------------------------------------------------------------

function guarded<C extends ButtonContext | SelectContext>(handler: (ctx: C) => Promise<void>) {
  return async (ctx: C) => {
    if (!isBotAdmin(ctx.guildMember)) {
      await ctx.interaction.reply({ content: 'Ce panneau est réservé à l’intendance de Voltron.', flags: MessageFlags.Ephemeral });
      return;
    }
    await handler(ctx);
    touchSession(key(ctx.interaction.guildId, ctx.interaction.user.id), ctx.interaction, TTL_MS);
  };
}

registerSelect(ADMIN_FEATURES_SELECT_ID, guarded(async ({ interaction, values }) => {
  const before = await getSettings(interaction.guildId);
  const after = await setEnabledFeatures(interaction.guildId, values);
  const changed = FEATURE_KEYS.filter((k) => isFeatureEnabled(before, k) !== isFeatureEnabled(after, k));
  const enabledNow = (k: FeatureKey) => isFeatureEnabled(after, k);
  await afterToggle(interaction.guild, changed, enabledNow);
  await interaction.update(await renderHome(interaction.guildId, describeChange(changed, enabledNow) ?? 'Aucun changement.'));
}));

registerSelect(ADMIN_MODULE_SELECT_ID, guarded(async ({ interaction, values }) => {
  const module = MODULES.find((m) => m.key === values[0]);
  if (!module) return void (await interaction.update(await renderHome(interaction.guildId)));
  await interaction.update(await renderModule(interaction.guild, module.key));
}));

registerButtonPrefix(ADMIN_MODULE_PREFIX, guarded(async ({ interaction, arg }) => {
  const module = MODULES.find((m) => m.key === arg);
  await interaction.update(module ? await renderModule(interaction.guild, module.key) : await renderHome(interaction.guildId));
}));

registerButtonPrefix(ADMIN_TOGGLE_PREFIX, guarded(async ({ interaction, arg }) => {
  const [moduleKey, featureKey] = arg.split(':') as [ModuleKey, FeatureKey];
  const module = MODULES.find((m) => m.key === moduleKey);
  if (!module || !module.features.includes(featureKey)) return void (await interaction.update(await renderHome(interaction.guildId)));
  const before = await getSettings(interaction.guildId);
  const after = await setFeatureEnabled(interaction.guildId, featureKey, !isFeatureEnabled(before, featureKey));
  const enabledNow = (k: FeatureKey) => isFeatureEnabled(after, k);
  await afterToggle(interaction.guild, [featureKey], enabledNow);
  await interaction.update(await renderModule(interaction.guild, module.key, describeChange([featureKey], enabledNow)));
}));

registerButton(ADMIN_HOME_ID, guarded(async ({ interaction }) => {
  await interaction.update(await renderHome(interaction.guildId));
}));

registerButton(ADMIN_REFRESH_ID, guarded(async ({ interaction }) => {
  await interaction.update(await renderHome(interaction.guildId, 'Panneau rafraîchi.'));
}));

registerButton(ADMIN_CLOSE_ID, async (ctx) => {
  if (!isBotAdmin(ctx.guildMember)) return;
  await ctx.interaction.update(buildClosedView());
  await closeSession(key(ctx.interaction.guildId, ctx.interaction.user.id));
});
