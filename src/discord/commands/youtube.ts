import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../types.js';
import { createLogger } from '../../core/logger.js';
import { getSettings } from '../../modules/settings/settings.service.js';
import { canDj, ensurePlayer, getPlayer } from '../../modules/music/music.service.js';
import { extract } from '../../modules/music/ytdlp.js';
import { buildQueueMessage, label } from '../../modules/music/music.view.js';
import { fmtDuration, LOOP_LABEL, shorten, type LoopMode } from '../../modules/music/format.js';

const log = createLogger('musique');

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('Musique YouTube dans le vocal')
    .addSubcommand((s) => s.setName('play').setDescription('Joue une vidéo, une playlist YouTube ou une recherche').addStringOption((o) => o.setName('recherche').setDescription('URL YouTube (vidéo ou playlist) ou termes de recherche').setRequired(true)))
    .addSubcommand((s) => s.setName('ajouter').setDescription('Ajoute une piste juste après celle en cours (passe devant la file)').addStringOption((o) => o.setName('recherche').setDescription('URL YouTube ou termes de recherche').setRequired(true)))
    .addSubcommand((s) => s.setName('player').setDescription('Affiche le lecteur (piste en cours et boutons)'))
    .addSubcommand((s) => s.setName('skip').setDescription('Passe à la piste suivante'))
    .addSubcommand((s) => s.setName('precedent').setDescription('Revient à la piste précédente'))
    .addSubcommand((s) => s.setName('pause').setDescription('Met la lecture en pause'))
    .addSubcommand((s) => s.setName('resume').setDescription('Reprend la lecture'))
    .addSubcommand((s) => s.setName('stop').setDescription('Arrête tout, vide la file et quitte le vocal'))
    .addSubcommand((s) => s.setName('queue').setDescription('Affiche la file d’attente').addIntegerOption((o) => o.setName('page').setDescription('Numéro de page (10 pistes par page)').setMinValue(1)))
    .addSubcommand((s) => s.setName('shuffle').setDescription('Mélange la file d’attente'))
    .addSubcommand((s) => s.setName('loop').setDescription('Mode de boucle').addStringOption((o) => o.setName('mode').setDescription('off, piste ou file').setRequired(true).addChoices({ name: 'off', value: 'off' }, { name: 'piste', value: 'track' }, { name: 'file', value: 'queue' })))
    .addSubcommand((s) => s.setName('volume').setDescription('Règle le volume (0 à 200 %)').addIntegerOption((o) => o.setName('niveau').setDescription('Volume en pourcentage').setRequired(true).setMinValue(0).setMaxValue(200)))
    .addSubcommand((s) => s.setName('remove').setDescription('Retire une piste de la file par son numéro').addIntegerOption((o) => o.setName('numero').setDescription('Numéro affiché dans la file').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('clear').setDescription('Vide la file d’attente (garde la piste en cours)')),

  async execute({ interaction, guildMember }) {
    const s = await getSettings(interaction.guildId);
    const sub = interaction.options.getSubcommand(true);
    const priv = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!canDj(guildMember, s)) return void (await priv(`❌ Il faut le rôle <@&${s.djRoleId}> pour utiliser la musique.`));

    if (sub === 'play' || sub === 'ajouter') {
      const playNext = sub === 'ajouter';
      const query = interaction.options.getString('recherche', true).trim();
      const voice = guildMember.voice.channel;
      if (!voice) return void (await priv('❌ Tu dois être dans un salon vocal.'));
      const perms = voice.permissionsFor(interaction.guild.members.me!);
      const missing = [[PermissionFlagsBits.ViewChannel, 'Voir le salon'], [PermissionFlagsBits.Connect, 'Se connecter'], [PermissionFlagsBits.Speak, 'Parler']].filter(([p]) => !perms.has(p as bigint)).map(([, n]) => `« ${n} »`);
      if (missing.length) return void (await priv(`❌ Il me manque ${missing.join(', ')} dans ${voice.name}. Un admin peut me l’accorder dans les permissions du salon.`));
      if (!interaction.channel?.isSendable() || interaction.channel.isDMBased()) return void (await priv('❌ Je ne peux pas afficher le lecteur ici.'));
      const existing = getPlayer(interaction.guildId);
      if (existing && existing.voiceChannelId !== voice.id && existing.playing) return void (await priv('❌ Je joue déjà dans un autre salon vocal.'));
      await interaction.deferReply();
      const p = ensurePlayer(interaction.guild, interaction.channel);
      try {
        await p.connect(voice);
      } catch (err) {
        await interaction.deleteReply().catch(() => undefined);
        return void (await interaction.followUp({ content: `❌ ${(err as Error).message}`, flags: MessageFlags.Ephemeral }));
      }
      let result;
      try {
        result = await extract(query, guildMember.displayName, guildMember.id, guildMember.displayAvatarURL({ extension: 'png', size: 128 }));
      } catch (err) {
        log.warn(`Extraction échouée pour « ${query} » : ${(err as Error).message}`);
        await interaction.deleteReply().catch(() => undefined);
        return void (await interaction.followUp({ content: `❌ Impossible de lire cette demande : ${(err as Error).message}`, flags: MessageFlags.Ephemeral }));
      }
      const wasPlaying = p.current !== null;
      if (result.playlistTitle) {
        const total = result.tracks.reduce((n, t) => n + (t.duration ?? 0), 0);
        p.lastAdded = `📜 **${shorten(result.playlistTitle, 60)}** · ${result.tracks.length} pistes · \`${fmtDuration(total)}\` · par ${guildMember.displayName}`;
      } else {
        const t = result.tracks[0]!;
        const pos = wasPlaying ? (playNext ? 1 : p.queue.length + 1) : 0;
        p.lastAdded = `${label(t)}${pos ? ` · position #${pos}` : ''} · par ${guildMember.displayName}`;
      }
      p.enqueue(result.tracks, { next: playNext });
      if (wasPlaying) await p.showController(interaction); // pas de changement de piste : le lecteur répond tout de suite
      else {
        // La lecture démarre et publie le lecteur en bas du salon ; on clôt la réponse discrètement.
        await interaction.deleteReply().catch(() => undefined);
        await interaction.followUp({ content: `▶️ Lancement de la lecture… ${result.tracks.length} piste(s) ajoutée(s).`, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    const p = getPlayer(interaction.guildId);
    if (sub === 'queue') {
      if (!p || (!p.current && !p.queue.length)) return void (await priv('La file est vide.'));
      return void (await interaction.reply({ ...buildQueueMessage(p, interaction.options.getInteger('page') ?? 1), flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] }));
    }
    if (!p) return void (await priv('❌ Je ne suis pas connectée à un salon vocal.'));
    const refresh = async (content: string) => { await priv(content); await p.editController(); };

    switch (sub) {
      case 'player':
        if (!interaction.channel?.isSendable() || interaction.channel.isDMBased()) return void (await priv('❌ Je ne peux pas afficher le lecteur ici.'));
        p.textChannel = interaction.channel;
        await interaction.deferReply();
        return p.showController(interaction);
      case 'skip': {
        if (!p.current) return void (await priv('Rien n’est en lecture.'));
        const title = p.current.title;
        p.skip();
        return void (await priv(`⏭️ Piste passée : **${title}**`));
      }
      case 'precedent': {
        const prev = p.history.at(-1);
        if (!prev) return void (await priv('Pas de piste précédente.'));
        p.previous();
        return void (await priv(`⏮️ Retour à : **${prev.title}**`));
      }
      case 'pause':
        return p.pause() ? refresh('⏸️ Pause.') : void (await priv('Rien à mettre en pause.'));
      case 'resume':
        return p.resume() ? refresh('▶️ Reprise.') : void (await priv('La lecture n’est pas en pause.'));
      case 'stop':
        await priv('⏹️ Arrêt, file vidée, déconnexion.');
        return p.stop();
      case 'shuffle':
        return refresh(`🔀 File mélangée (${p.shuffle()} pistes).`);
      case 'loop': {
        p.loopMode = interaction.options.getString('mode', true) as LoopMode;
        return refresh(`Boucle : **${LOOP_LABEL[p.loopMode]}**`);
      }
      case 'volume': {
        const level = interaction.options.getInteger('niveau', true);
        p.setVolume(level / 100);
        return refresh(`🔊 Volume : **${level} %**`);
      }
      case 'remove': {
        const removed = p.remove(interaction.options.getInteger('numero', true));
        if (!removed) return void (await priv('❌ Numéro invalide.'));
        return refresh(`🗑️ Retiré : **${removed.title}**`);
      }
      case 'clear':
        return refresh(`🧹 File vidée (${p.clear()} pistes retirées).`);
    }
  },
});
