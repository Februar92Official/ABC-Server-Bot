const express = require('express');
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin';
const WHITELISTED_USERIDS = (process.env.WHITELISTED_USERIDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('DISCORD_TOKEN fehlt (Umgebungsvariable).');
  process.exit(1);
}

// --- Webserver: Render braucht einen offenen Port, UptimeRobot pingt diese URL ---
const app = express();
app.get('/', (req, res) => res.send('Bot läuft ✅'));
app.listen(PORT, () => console.log(`Webserver auf Port ${PORT}`));

// --- Friedenszeit-Logik ---
// Gerade Stunde (00, 02, 04, ...) -> Aktiv | Ungerade Stunde (01, 03, 05, ...) -> Inaktiv

function formatAMPM(hour) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h.toString().padStart(2, '0')}:00 ${ampm}`;
}

function slotString(hour) {
  return `${formatAMPM(hour)} – ${formatAMPM((hour + 1) % 24)}`;
}

function getZonedTime() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { hours: get('hour'), minutes: get('minute'), seconds: get('second') };
}

function buildFriedenszeitEmbed() {
  const { hours, minutes, seconds } = getZonedTime();
  const isActive = hours % 2 === 0;

  const passed = minutes * 60 + seconds;
  const remaining = 3600 - passed;
  const rm = Math.floor(remaining / 60).toString().padStart(2, '0');
  const rs = (remaining % 60).toString().padStart(2, '0');
  const nextChangeUnix = Math.floor(Date.now() / 1000) + remaining;

  const filled = Math.round((passed / 3600) * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const percent = Math.round((passed / 3600) * 100);

  const upcoming = [1, 2, 3]
    .map((n) => {
      const h = (hours + n) % 24;
      return `${h % 2 === 0 ? '🟢' : '🔴'} \`${slotString(h)}\``;
    })
    .join('\n');

  return new EmbedBuilder()
    .setTitle('🕊️ Friedenszeit')
    .setColor(isActive ? 0x22c55e : 0xef4444)
    .setDescription(`# ${isActive ? '🟢 AKTIV' : '🔴 INAKTIV'}`)
    .addFields(
      { name: 'Aktuelles Zeitfenster', value: `\`${slotString(hours)}\`` },
      { name: 'Countdown', value: `\`00:${rm}:${rs}\` (Wechsel <t:${nextChangeUnix}:R>)` },
      { name: 'Fortschritt', value: `${bar} ${percent}%` },
      { name: 'Als Nächstes', value: upcoming },
    )
    .setFooter({ text: `Zeitzone: ${TIMEZONE}` })
    .setTimestamp();
}

// --- Discord-Bot ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`Eingeloggt als ${c.user.tag}`);
  try {
    const registered = await c.application.commands.set([
      { name: 'ping', description: 'Testet die Antwortgeschwindigkeit vom Bot...' },
      { name: 'friedenszeit', description: 'Zeigt, ob die Friedenszeit gerade aktiv ist.' },
    ]);
    console.log('Commands registriert:', registered.map((cmd) => cmd.name).join(', '));
  } catch (err) {
    console.error('Command-Registrierung fehlgeschlagen:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    if (!WHITELISTED_USERIDS.includes(interaction.user.id)) {
      return interaction.reply({
        content: "⛔ You don't have the permission to use the command!",
        flags: 64, // nur für den Nutzer sichtbar
      });
    }

    const start = Date.now();
    await interaction.reply('🏓 Pinge...');
    const roundtrip = Date.now() - start;
    await interaction.editReply(
      `🏓 Pong!\n` +
      `Antwortzeit: **${roundtrip} ms**\n` +
      `Websocket: **${Math.round(client.ws.ping)} ms**`
    );
  }

  if (interaction.commandName === 'friedenszeit') {
    await interaction.reply({ embeds: [buildFriedenszeitEmbed()] });
  }
});

client.login(TOKEN);
