import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} from "@whiskeysockets/baileys";
import pino from "pino";
import OpenAI from "openai";
import fs from "node:fs/promises";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const BOT_ENABLED = (process.env.BOT_ENABLED || "true").toLowerCase() === "true";
const REPLY_GROUPS = (process.env.REPLY_GROUPS || "false").toLowerCase() === "true";
const ALLOWED_NUMBERS = new Set(
  (process.env.ALLOWED_NUMBERS || "")
    .split(",")
    .map(v => v.replace(/\\D/g, ""))
    .filter(Boolean)
);

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
`أنت مساعد شخصي تكتب الردود نيابة عن صاحب رقم واتساب.
- اكتب كأنك ترد بشكل طبيعي على واتساب، بدون مقدمات رسمية.
- استخدم اللهجة المصرية عندما تكون الرسالة بالعربية.
- كن مختصرًا وطبيعيًا، وناسب طول الرد مع الرسالة.
- لا تذكر أنك ذكاء اصطناعي إلا إذا سُئلت مباشرة.
- لا تخترع معلومات أو مواعيد أو أسعار.
- لا ترسل أي شيء خارج الرد نفسه.
- لا تستخدم عناوين أو Markdown إلا إذا كان ذلك مفيدًا فعلاً.`;

const AUTH_DIR = process.env.AUTH_DIR || "./auth_info";

async function askAI(text, sender) {
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    instructions: SYSTEM_PROMPT,
    input: `اسمح لكاتب الرد أن يرى رقم المرسل داخليًا فقط: ${sender}\\nالرسالة الواردة:\\n${text}`,
    max_output_tokens: 500
  });
  return response.output_text?.trim() || "معلش، مقدرتش أجهز رد دلوقتي.";
}

function normalizeNumber(jid = "") {
  return jid.split("@")[0].replace(/:\\d+$/, "").replace(/\\D/g, "");
}

function isAllowed(jid) {
  if (ALLOWED_NUMBERS.size === 0) return true;
  return ALLOWED_NUMBERS.has(normalizeNumber(jid));
}

async function requestPairingCode(sock) {
  if (sock.authState?.creds?.registered) return;
  const number = (process.env.WHATSAPP_NUMBER || "").replace(/\\D/g, "");
  if (!number) {
    console.log("Set WHATSAPP_NUMBER with country code, e.g. 2010XXXXXXXX");
    return;
  }

  // WhatsApp's pairing flow is sensitive to the companion browser identity.
  // Use a canonical Baileys browser tuple rather than a custom app label.
  await new Promise(r => setTimeout(r, 1500));
  const code = await sock.requestPairingCode(number);
  console.log("\\n========================================");
  console.log("WhatsApp pairing code:", code);
  console.log("On your phone: WhatsApp > Settings > Linked Devices > Link a Device");
  console.log("Choose 'Link with phone number instead' and enter the code.");
  console.log("========================================\\n");
}

async function start() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Safari"),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false
  });

  sock.ev.on("creds.update", saveCreds);

  let pairingRequested = false;
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (connection === "open") {
      console.log("WhatsApp connected. AI auto-reply:", BOT_ENABLED ? "ON" : "OFF");
    }

    // Request pairing only once, after the socket has started its connection flow.
    if (qr && !sock.authState?.creds?.registered && !pairingRequested) {
      pairingRequested = true;
      try {
        await requestPairingCode(sock);
      } catch (error) {
        pairingRequested = false;
        console.error("Pairing code error:", error?.message || error);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("WhatsApp disconnected.", shouldReconnect ? "Reconnecting..." : "Logged out.");
      if (shouldReconnect) setTimeout(start, 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !BOT_ENABLED) return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        if (!jid || jid === "status@broadcast") continue;
        if (!REPLY_GROUPS && jid.endsWith("@g.us")) continue;
        if (!isAllowed(jid)) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          "";

        if (!text.trim()) continue;

        console.log("Incoming:", normalizeNumber(jid), text);
        const reply = await askAI(text.trim(), normalizeNumber(jid));
        await sock.sendMessage(jid, { text: reply });
        console.log("Replied:", reply);
      } catch (error) {
        console.error("Message error:", error?.message || error);
      }
    }
  });
}

start().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
