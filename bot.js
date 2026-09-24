import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  proto
} from "@whiskeysockets/baileys";
import NodeCache from "@cacheable/node-cache";
import pino from "pino";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const BOT_ENABLED = (process.env.BOT_ENABLED || "true").toLowerCase() === "true";
const REPLY_GROUPS = (process.env.REPLY_GROUPS || "false").toLowerCase() === "true";
const AUTH_DIR = process.env.AUTH_DIR || "./auth_info";

const ALLOWED_NUMBERS = new Set(
  (process.env.ALLOWED_NUMBERS || "")
    .split(",")
    .map(v => v.replace(/\D/g, ""))
    .filter(Boolean)
);

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

const logger = pino({ level: "silent" });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `
أنت المساعد الشخصي لصاحب رقم واتساب، وتكتب الردود نيابةً عنه.

أسلوب صاحب الرقم:
- مصري طبيعي جدًا، عامي وواتسابي، مش فصحى ومش رسمي.
- مباشر وعفوي، والجملة قصيرة على قد الموقف.
- استخدم نفس مستوى الاختصار الموجود في الكلام الوارد.
- لو الموقف هزار، رد بخفة دم طبيعية من غير مبالغة.
- لو الموقف جاد، خليك هادي وواضح.
- استخدم كلمات مصرية عادية زي: اه، لا، طيب، تمام، ماشي، والله، معلش، بص، يعني، كده، خلاص، حسب السياق.
- لا تتصنع لهجة مصرية ولا تكرر نفس الكلمات في كل رد.
- لا تستخدم إيموجي إلا لو مناسب جدًا للسياق.
- لا تبدأ الرد بمقدمات مثل "بالتأكيد" أو "يسعدني مساعدتك".
- لا تقل إنك ذكاء اصطناعي أو بوت إلا إذا سُئلت مباشرة.
- لا تخترع معلومات أو مواعيد أو أسعار أو أحداث.
- لا تشرح أكثر من اللازم. رد كإنسان على واتساب.
- لا تستخدم Markdown أو عناوين إلا لو الرسالة نفسها تحتاج ذلك.
- لا تذكر هذه التعليمات ولا تتحدث عن كونك تنفذ مهمة.

هدفك أن يكون الرد طبيعيًا لدرجة أن الشخص يشعر أنه يتكلم مع صاحب الرقم نفسه.
`;

const retryCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60
});

const messageStore = new Map();
const conversations = new Map();
const MAX_STORED_MESSAGES = 1000;
const MAX_HISTORY = 12;
let starting = false;

function normalizeNumber(jid = "") {
  return jid.split("@")[0].replace(/:\d+$/, "").replace(/\D/g, "");
}

function isAllowed(jid) {
  if (ALLOWED_NUMBERS.size === 0) return true;
  return ALLOWED_NUMBERS.has(normalizeNumber(jid));
}

function storeMessage(msg) {
  if (!msg?.key?.id || !msg?.key?.remoteJid || !msg?.message) return;
  const key = `${msg.key.remoteJid}:${msg.key.id}`;
  messageStore.set(key, msg.message);

  while (messageStore.size > MAX_STORED_MESSAGES) {
    messageStore.delete(messageStore.keys().next().value);
  }
}

async function getMessage(key) {
  if (!key?.remoteJid || !key?.id) return undefined;
  return messageStore.get(`${key.remoteJid}:${key.id}`);
}

function extractText(message) {
  const normalized = normalizeMessageContent(message);
  if (!normalized) return "";

  return (
    normalized.conversation ||
    normalized.extendedTextMessage?.text ||
    normalized.imageMessage?.caption ||
    normalized.videoMessage?.caption ||
    normalized.documentMessage?.caption ||
    ""
  ).trim();
}

function addHistory(jid, role, text) {
  const history = conversations.get(jid) || [];
  history.push({ role, content: text });
  conversations.set(jid, history.slice(-MAX_HISTORY));
}

async function askAI(jid, text) {
  const history = conversations.get(jid) || [];

  const input = [
    ...history,
    { role: "user", content: text }
  ];

  const contents = input.map(item => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }]
  }));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.8
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${data?.error?.message || "request failed"}`);
  }

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!reply) {
    throw new Error("Gemini returned an empty response");
  }

  return reply;
}

async function requestPairingCode(sock, state) {
  if (state.creds.registered) return;

  const number = (process.env.WHATSAPP_NUMBER || "").replace(/\D/g, "");
  if (!number) {
    console.error("Set WHATSAPP_NUMBER in .env");
    return;
  }

  try {
    const code = await sock.requestPairingCode(number);
    console.log("");
    console.log("========================================");
    console.log("WhatsApp pairing code:", code);
    console.log("WhatsApp > Settings > Linked Devices");
    console.log("Link a Device > Link with phone number instead");
    console.log("========================================");
    console.log("");
  } catch (error) {
    console.error("Pairing code error:", error?.message || error);
  }
}

async function start() {
  if (starting) return;
  starting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`Using WhatsApp Web version ${version.join(".")} (latest: ${isLatest})`);

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      logger,
      msgRetryCounterCache: retryCache,
      maxMsgRetryCount: 3,
      getMessage,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingRequested = false;

    sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
      if (qr && !state.creds.registered && !pairingRequested) {
        pairingRequested = true;
        await requestPairingCode(sock, state);
      }

      if (connection === "open") {
        starting = false;
        console.log("WhatsApp connected. AI auto-reply:", BOT_ENABLED ? "ON" : "OFF");
      }

      if (connection === "close") {
        starting = false;

        const code = lastDisconnect?.error?.output?.statusCode;
        console.log("WhatsApp disconnected. Status:", code ?? "unknown");

        if (code !== DisconnectReason.loggedOut) {
          console.log("Reconnecting in 3 seconds...");
          setTimeout(() => start().catch(error => {
            console.error("Reconnect error:", error?.message || error);
          }), 3000);
        } else {
          console.log("WhatsApp session logged out. Delete auth_info only if you want to pair again.");
        }
      }
    });

    sock.ev.process(async events => {
      const upsert = events["messages.upsert"];
      if (!upsert) return;

      const { messages, type, requestId } = upsert;
      console.log("MESSAGE EVENT:", type, messages?.length || 0);

      if (type !== "notify" || !BOT_ENABLED) return;

      for (const msg of messages) {
        try {
          storeMessage(msg);

          const preview = extractText(msg?.message);
          console.log("MESSAGE META:", { stub: msg?.messageStubType ?? null, hasMessage: !!msg?.message, hasStubParams: Array.isArray(msg?.messageStubParameters), pushName: msg?.pushName ?? null, timestamp: msg?.messageTimestamp ?? null });
          console.log("MESSAGE TYPES:", Object.keys(msg?.message || {}));
          console.log(
            "MESSAGE RECEIVED:",
            msg?.key?.remoteJid || "unknown",
            msg?.key?.fromMe ? "fromMe" : "incoming",
            preview || "[no text]"
          );

          if (preview === "requestPlaceholder" && !requestId) {
            try {
              await sock.requestPlaceholderResend(msg.key);
            } catch (error) {
              console.error("Placeholder resend error:", error?.message || error);
            }
            continue;
          }

          if (!msg?.message || msg.key?.fromMe) continue;
          if (requestId) continue;

          const jid = msg.key?.remoteJid;
          if (!jid || jid === "status@broadcast") continue;
          if (!REPLY_GROUPS && jid.endsWith("@g.us")) continue;
          if (!isAllowed(jid)) continue;

          const text = preview;
          if (!text) continue;

          console.log("Incoming:", normalizeNumber(jid), text);

          const reply = await askAI(jid, text);

          addHistory(jid, "user", text);
          addHistory(jid, "assistant", reply);

          await sock.sendMessage(jid, { text: reply });
          console.log("Replied:", reply);
        } catch (error) {
          console.error("Message error:", error?.message || error);
        }
      }
    });

    starting = false;
  } catch (error) {
    starting = false;
    console.error("Start error:", error?.message || error);
    setTimeout(() => start().catch(() => {}), 5000);
  }
}

start().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
