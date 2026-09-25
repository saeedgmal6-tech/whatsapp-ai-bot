import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  Browsers,
  normalizeMessageContent,
  getContentType,
  downloadMediaMessage
} from "@whiskeysockets/baileys";
import { NodeCache } from "@cacheable/node-cache";
import pino from "pino";
import fs from "fs";

const PHONE_NUMBER = String(process.env.PHONE_NUMBER || "").replace(/\D/g, "");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const BOT_NAME = process.env.BOT_NAME || "WhatsApp AI";
const AUTH_DIR = process.env.AUTH_DIR || "./auth_info";
const IGNORE_GROUPS = process.env.IGNORE_GROUPS !== "false";
const MEMORY_FILE = process.env.MEMORY_FILE || "./memory.json";
const CONFIG_FILE = process.env.CONFIG_FILE || "./bot_config.json";
const MAX_MEMORY_MESSAGES = 60;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MANUAL_TAKEOVER_MS = 10 * 60 * 1000;
const BATCH_WINDOW_MS = 1400;

const DEFAULT_CONFIG = {
  enabled: true,
  replyDelayMinMs: 700,
  replyDelayMaxMs: 2200,
  manualTakeoverMinutes: 10,
  ignoredJids: [],
  ignoredGroups: [],
  specialPeople: {},
  systemPrompt: ""
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      return { ...DEFAULT_CONFIG, ...saved };
    }
  } catch (error) {
    console.error("Config load error:", error);
  }
  return { ...DEFAULT_CONFIG };
}

const CONFIG = loadConfig();

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
`أنت شخص مصري عادي بترد على WhatsApp نيابةً عن صاحب الرقم. هدفك إن ردك يبان كأنه مكتوب بإيد بني آدم يعرف الشخص اللي بيكلمه، مش رد ذكاء اصطناعي.

قواعد أسلوب الكلام:
- اتكلم بالمصري الطبيعي اللي الناس بتستخدمه في الشات، مش عربي فصيح ومش لغة خدمة عملاء.
- افهم السياق قبل ما ترد، ورد على المعنى الحقيقي مش مجرد كلمات الرسالة.
- خليك عفوي وبسيط. لو "تمام" كفاية، قول "تمام". لو محتاج شرح، اشرح على قد الحاجة.
- متبدأش كل رد بتحية أو مقدمة. ادخل في الكلام على طول.
- متستخدمش نفس الجمل الجاهزة بشكل متكرر، وغيّر صياغتك حسب الشخص والموقف.
- متحاولش تبان لطيف زيادة أو رسمي زيادة. الطبيعي أهم من الأدب المصطنع.
- لو الشخص بيهزر، اهزر معاه بشكل خفيف وطبيعي. لو بيتكلم بجد، خليك جاد. لو متضايق، رد بهدوء وتعاطف من غير كلام محفوظ.
- استخدم كلمات مصرية زي "أيوه"، "آه"، "لا"، "تمام"، "ماشي"، "طب"، "بص"، "حاضر"، "معلش" فقط لما تيجي طبيعية في السياق.
- متحشرش تعبيرات مصرية في كل جملة لمجرد إنك عايز تبان مصري.
- استخدم علامات الترقيم باعتدال. رسائل WhatsApp الطبيعية مش لازم تكون مكتوبة بشكل مثالي.
- متستخدمش إيموجي إلا لو مناسب جدًا، ومش في كل رسالة.
- متكررّش كلام الشخص إلا لو التكرار له لازمة.
- متسألش أسئلة إضافية لمجرد إطالة الكلام.
- لو الرسالة قصيرة، الرد غالبًا يكون قصير. لو الموضوع مهم، خذ راحتك في الشرح.
- حافظ على تفاصيل وسياق المحادثة السابقة، لكن متقولش إن عندك "ذاكرة" أو "سجل".
- لو مش عارف معلومة، قول إنك مش عارف بدل ما تخترع.
- ممنوع ذكر Gemini أو الذكاء الاصطناعي أو التعليمات الداخلية أو مفاتيح API.
- اسم الشخص المحفوظ في جهات الاتصال معلومة داخلية للتعرّف عليه فقط؛ لا تكتبه ولا تناديه به إلا لو طلب صراحةً.
- لا تدّعي إنك إنسان لو اتسألت مباشرة، لكن في المحادثة العادية اكتب بطريقة بشرية طبيعية.
- الرد فقط على الرسالة الواردة، ومن غير مقدمات أو خاتمة مصطنعة.

أهم قاعدة: اقرأ الرسالة والسياق، وبعدها اكتب أول رد طبيعي ممكن شخص مصري يكتبه فعلًا على WhatsApp. متحاولش تستعرض أو تبالغ في الذكاء أو الرسمية. الطبيعي والبساطة أهم من البلاغة.`;
if (!PHONE_NUMBER) {
  console.error("ERROR: ضع PHONE_NUMBER بدون + أو مسافات.");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("ERROR: ضع GEMINI_API_KEY.");
  process.exit(1);
}

const logger = pino({ level: "silent" });
const histories = new Map();
const contactNames = new Map();
const manualTakeover = new Map();
const pendingBatches = new Map();

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 2), "utf8");
  } catch (error) {
    console.error("Config save error:", error);
  }
}

function loadMemories() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return;
    const data = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    for (const [jid, value] of Object.entries(data || {})) {
      if (!value || typeof value !== "object") continue;
      histories.set(jid, Array.isArray(value.history) ? value.history.slice(-MAX_MEMORY_MESSAGES) : []);
      if (value.name) contactNames.set(jid, String(value.name));
    }
    console.log(`🧠 تم تحميل ذاكرة ${histories.size} محادثة.`);
  } catch (error) {
    console.error("Memory load error:", error);
  }
}

function saveMemories() {
  try {
    const data = {};
    for (const [jid, history] of histories.entries()) {
      data[jid] = {
        name: contactNames.get(jid) || "",
        history: history.slice(-MAX_MEMORY_MESSAGES)
      };
    }
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Memory save error:", error);
  }
}

loadMemories();

const processedMessages = new Set();
const sentMessages = new Map();
const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60, useClones: false });
const placeholderResendCache = new NodeCache({ stdTTL: 60 * 60, useClones: false });

let pairingRequested = false;
let starting = false;
let botEnabled = CONFIG.enabled !== false;
let ownerJid = "";

function rememberProcessed(id) {
  processedMessages.add(id);
  if (processedMessages.size > 5000) {
    const first = processedMessages.values().next().value;
    if (first) processedMessages.delete(first);
  }
}

function rememberSentMessage(message) {
  const id = message?.key?.id;
  if (!id) return;
  sentMessages.set(id, message.message);
  if (sentMessages.size > 2000) {
    const first = sentMessages.keys().next().value;
    if (first) sentMessages.delete(first);
  }
}

function normalizeJid(jid) {
  return String(jid || "").replace(/:.*?(?=@)/, "");
}

function rememberContact(contact) {
  const jid = contact?.id;
  if (!jid) return;
  const savedName = String(contact?.name || "").trim();
  const profileName = String(contact?.notify || "").trim();
  if (savedName) contactNames.set(jid, savedName);
  else if (profileName && !contactNames.has(jid)) contactNames.set(jid, profileName);
  saveMemories();
}

function getContactName(message) {
  const jid = message?.key?.remoteJid;
  if (!jid) return "";
  return (
    contactNames.get(jid) ||
    contactNames.get(normalizeJid(jid)) ||
    String(message?.pushName || "").trim() ||
    String(message?.verifiedBizName || "").trim() ||
    ""
  );
}

function addHistory(jid, role, text) {
  const history = histories.get(jid) || [];
  history.push({ role, content: String(text || "").slice(0, 10000) });
  while (history.length > MAX_MEMORY_MESSAGES) history.shift();
  histories.set(jid, history);
  saveMemories();
}

function getSpecialPersonPrompt(jid, personName) {
  const rules = CONFIG.specialPeople?.[jid] || CONFIG.specialPeople?.[normalizeJid(jid)];
  if (!rules) return "";
  return `تعليمات خاصة بهذا الشخص:
${typeof rules === "string" ? rules : JSON.stringify(rules)}
اسم الشخص: ${personName || "غير متاح"}`;
}

function getNameContext(jid, personName) {
  if (personName) {
    return `اسم الشخص كما هو محفوظ في جهات اتصال صاحب الرقم: "${personName}". هذا الاسم معلومة داخلية فقط للتعرّف على الشخص وربط المحادثة. ممنوع كتابة الاسم أو مناداة الشخص به في الرد، إلا إذا طلب هو صراحةً أن تناديه باسمه.`;
  }
  return "اسم الشخص المحفوظ في جهات الاتصال غير متاح؛ لا تخترع اسمًا ولا تحاول مناداة الشخص باسم.";
}

async function askAI(jid, incomingText, media = null, personName = "") {
  const history = histories.get(jid) || [];
  const contents = history.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }]
  }));

  const userParts = [];
  if (incomingText) userParts.push({ text: incomingText });
  if (media?.data && media?.mimeType) {
    userParts.push({
      inlineData: {
        mimeType: media.mimeType,
        data: media.data
      }
    });
  }

  contents.push({
    role: "user",
    parts: userParts.length ? userParts : [{ text: "وصلت رسالة بدون نص." }]
  });

  const dynamicPrompt = [
    SYSTEM_PROMPT,
    CONFIG.systemPrompt || "",
    getNameContext(jid, personName),
    getSpecialPersonPrompt(jid, personName),
    `قواعد الوسائط:
- صورة: افهم محتواها ورد على المطلوب منها.
- فويس نوت أو صوت: افهم الكلام المسموع أولًا ورد على مضمونه.
- PDF: اقرأه وحلل المطلوب منه.
- ملف نصي: اقرأ محتواه إذا كان مدعومًا.
- فيديو: افهم محتواه قدر الإمكان.
- لا تذكر تفاصيل تقنية عن Gemini أو API أو base64.
- لو الوسيط غير قابل للقراءة، قل ذلك باختصار.`
  ].filter(Boolean).join("\n\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: dynamicPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 700,
          temperature: 0.7
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${JSON.stringify(data)}`);

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || "")
    .join("")
    .trim();

  if (!reply) throw new Error("Gemini returned an empty reply.");
  return reply;
}

function isGroup(jid) {
  return String(jid || "").endsWith("@g.us");
}

function isIgnored(jid) {
  if (CONFIG.ignoredJids?.includes(jid) || CONFIG.ignoredJids?.includes(normalizeJid(jid))) return true;
  if (isGroup(jid) && CONFIG.ignoredGroups?.includes(jid)) return true;
  return false;
}

function unwrapMessage(message) {
  let current = message;
  for (let i = 0; i < 8 && current; i++) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current;
}

function getNormalized(message) {
  return normalizeMessageContent(message?.message) || unwrapMessage(message?.message) || {};
}

function extractText(message) {
  const normalized = getNormalized(message);
  return (
    normalized?.conversation ||
    normalized?.extendedTextMessage?.text ||
    normalized?.imageMessage?.caption ||
    normalized?.videoMessage?.caption ||
    normalized?.documentMessage?.caption ||
    ""
  );
}

function getMediaInfo(message) {
  const normalized = getNormalized(message);
  const type = getContentType(normalized);

  if (type === "imageMessage") {
    return { node: normalized.imageMessage, mimeType: normalized.imageMessage?.mimetype || "image/jpeg", label: "صورة" };
  }
  if (type === "audioMessage") {
    return { node: normalized.audioMessage, mimeType: normalized.audioMessage?.mimetype || "audio/ogg", label: "فويس نوت" };
  }
  if (type === "videoMessage") {
    return { node: normalized.videoMessage, mimeType: normalized.videoMessage?.mimetype || "video/mp4", label: "فيديو" };
  }
  if (type === "documentMessage") {
    return {
      node: normalized.documentMessage,
      mimeType: normalized.documentMessage?.mimetype || "application/octet-stream",
      label: "ملف",
      fileName: normalized.documentMessage?.fileName || ""
    };
  }
  return null;
}

async function downloadMediaAsBase64(sock, message) {
  const info = getMediaInfo(message);
  if (!info?.node) return null;

  const size = Number(info.node.fileLength || 0);
  if (size && size > MAX_MEDIA_BYTES) throw new Error(`Media too large: ${size} bytes`);

  const buffer = await downloadMediaMessage(
    message,
    "buffer",
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );

  if (!buffer?.length) return null;
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error(`Media too large: ${buffer.length} bytes`);

  return {
    data: buffer.toString("base64"),
    mimeType: info.mimeType,
    label: info.label,
    fileName: info.fileName || ""
  };
}

function randomDelay() {
  const min = Math.max(0, Number(CONFIG.replyDelayMinMs ?? 700));
  const max = Math.max(min, Number(CONFIG.replyDelayMaxMs ?? 2200));
  return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showTyping(sock, jid, duration) {
  try {
    await sock.presenceSubscribe(jid);
    await sock.sendPresenceUpdate("composing", jid);
    await sleep(duration);
    await sock.sendPresenceUpdate("paused", jid);
  } catch {}
}

function takeoverActive(jid) {
  const until = manualTakeover.get(jid) || 0;
  return until > Date.now();
}

function setTakeover(jid, minutes = CONFIG.manualTakeoverMinutes) {
  manualTakeover.set(jid, Date.now() + Math.max(1, Number(minutes) || 10) * 60 * 1000);
}

function clearTakeover(jid) {
  manualTakeover.delete(jid);
}

function parseCommand(text) {
  const value = String(text || "").trim();
  if (!value.startsWith("/")) return null;
  const parts = value.slice(1).split(/\s+/);
  return {
    name: (parts.shift() || "").toLowerCase(),
    args: parts.join(" ").trim()
  };
}

async function handleOwnerCommand(sock, jid, text) {
  const command = parseCommand(text);
  if (!command) return false;
  if (normalizeJid(jid) !== normalizeJid(ownerJid)) return false;

  if (command.name === "stop") {
    botEnabled = false;
    CONFIG.enabled = false;
    saveConfig();
    await sock.sendMessage(jid, { text: "تمام، البوت اتوقف." });
    return true;
  }

  if (command.name === "start") {
    botEnabled = true;
    CONFIG.enabled = true;
    saveConfig();
    await sock.sendMessage(jid, { text: "تمام، البوت اشتغل." });
    return true;
  }

  if (command.name === "bot") {
    if (!command.args) {
      await sock.sendMessage(jid, { text: `حالة البوت: ${botEnabled ? "شغال" : "متوقف"}.` });
      return true;
    }
    if (command.args.toLowerCase() === "on") {
      botEnabled = true;
      CONFIG.enabled = true;
      saveConfig();
      await sock.sendMessage(jid, { text: "تمام، شغال." });
    } else if (command.args.toLowerCase() === "off") {
      botEnabled = false;
      CONFIG.enabled = false;
      saveConfig();
      await sock.sendMessage(jid, { text: "تمام، وقفته." });
    }
    return true;
  }

  if (command.name === "memory") {
    const count = histories.get(jid)?.length || 0;
    await sock.sendMessage(jid, { text: `الذاكرة عندي فيها ${count} رسالة من المحادثة دي.` });
    return true;
  }

  if (command.name === "clear") {
    histories.delete(jid);
    clearTakeover(jid);
    saveMemories();
    await sock.sendMessage(jid, { text: "تمام، مسحت ذاكرة المحادثة دي." });
    return true;
  }

  if (command.name === "resume") {
    clearTakeover(jid);
    await sock.sendMessage(jid, { text: "تمام، رجعت البوت يرد على المحادثة." });
    return true;
  }

  return false;
}

async function sendReply(sock, jid, reply) {
  const delay = randomDelay();
  await showTyping(sock, jid, Math.min(delay, 2500));
  const sent = await sock.sendMessage(jid, { text: reply });
  rememberSentMessage(sent);
  return sent;
}

async function processBatch(sock, messages) {
  if (!messages?.length) return;
  const first = messages[0];
  const key = first?.key;
  const jid = key?.remoteJid;
  if (!jid) return;

  try {
    const textParts = [];
    let mediaMessage = null;
    let personName = getContactName(first);

    for (const message of messages) {
      if (!message?.message) continue;
      const text = extractText(message).trim();
      if (text) textParts.push(text);
      if (!mediaMessage && getMediaInfo(message)) mediaMessage = message;
      personName = getContactName(message) || personName;
    }

    const text = textParts.join("\n").trim();
    const mediaInfo = mediaMessage ? getMediaInfo(mediaMessage) : null;

    if (!text && !mediaInfo) return;

    if (personName) console.log(`👤 الشخص: ${personName}`);
    if (text) console.log(`📩 incoming: ${text}`);
    if (mediaInfo) console.log(`📎 incoming media: ${mediaInfo.label}${mediaInfo.fileName ? ` (${mediaInfo.fileName})` : ""}`);

    let media = null;
    if (mediaMessage) {
      media = await downloadMediaAsBase64(sock, mediaMessage);
      if (!media) return;
    }

    const reply = await askAI(jid, text, media, personName);
    console.log(`📤 reply: ${reply}`);

    const sent = await sendReply(sock, jid, reply);
    const historyText = media
      ? `[رسالة ${media.label}${media.fileName ? `: ${media.fileName}` : ""}]${text ? ` ${text}` : ""}`
      : text;

    addHistory(jid, "user", historyText);
    addHistory(jid, "assistant", reply);
    console.log(`✅ تم إرسال الرد إلى WhatsApp: ${sent?.key?.id || "unknown"}`);
  } catch (error) {
    console.error("Message error:", error);
    try {
      await sock.sendMessage(jid, { text: "معلش، حصل عطل مؤقت. ابعت الرسالة تاني بعد لحظات." });
    } catch {}
  }
}

function queueMessage(sock, message) {
  const jid = message?.key?.remoteJid;
  if (!jid) return;

  const existing = pendingBatches.get(jid);
  if (existing) {
    existing.messages.push(message);
    clearTimeout(existing.timer);
  } else {
    pendingBatches.set(jid, { messages: [message], timer: null });
  }

  const batch = pendingBatches.get(jid);
  batch.timer = setTimeout(async () => {
    const current = pendingBatches.get(jid);
    pendingBatches.delete(jid);
    await processBatch(sock, current?.messages || []);
  }, BATCH_WINDOW_MS);
}

async function processIncomingMessage(sock, message) {
  try {
    const key = message?.key;
    const jid = key?.remoteJid;
    const id = key?.id;

    console.log(`📨 message: jid=${jid || "unknown"} fromMe=${!!key?.fromMe} stub=${message?.messageStubType || "none"} hasMessage=${!!message?.message}`);

    if (!jid || !id) return;

    if (key?.fromMe) {
      if (!sentMessages.has(id) && jid !== ownerJid) {
        setTakeover(jid);
        console.log(`✋ تدخل يدوي: البوت هيسكت مع ${jid} لمدة ${CONFIG.manualTakeoverMinutes} دقيقة.`);
      }
      return;
    }

    if (IGNORE_GROUPS && isGroup(jid)) return;
    if (isIgnored(jid)) return;
    if (!message?.message) return;
    if (processedMessages.has(id)) return;
    rememberProcessed(id);

    if (!botEnabled || CONFIG.enabled === false) return;
    if (takeoverActive(jid)) {
      console.log(`⏸️ المحادثة تحت سيطرة صاحب الرقم مؤقتًا: ${jid}`);
      return;
    }

    const text = extractText(message).trim();
    if (normalizeJid(jid) === normalizeJid(ownerJid) && await handleOwnerCommand(sock, jid, text)) return;

    queueMessage(sock, message);
  } catch (error) {
    console.error("Incoming processing error:", error);
  }
}

async function startWhatsApp() {
  if (starting) return;
  starting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    console.log("جاري جلب إصدار WhatsApp Web الحالي...");
    const { version } = await fetchLatestWaWebVersion({});
    console.log(`WhatsApp Web version: ${version.join(".")}`);

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      msgRetryCounterCache,
      placeholderResendCache,
      maxMsgRetryCount: 5,
      retryRequestDelayMs: 250,
      enableRecentMessageCache: true,
      enableAutoSessionRecreation: true,
      getMessage: async (key) => sentMessages.get(key.id)
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts || []) rememberContact(contact);
      console.log(`👥 تم تحديث جهات الاتصال: ${contacts?.length || 0}`);
    });

    sock.ev.on("contacts.update", (contacts) => {
      for (const contact of contacts || []) rememberContact(contact);
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection === "connecting") console.log("جاري الاتصال بواتساب...");

      if (!state.creds.registered && qr && !pairingRequested) {
        pairingRequested = true;
        try {
          const raw = await sock.requestPairingCode(PHONE_NUMBER);
          const code = String(raw).replace(/[^A-Za-z0-9]/g, "");
          console.log("\n==============================");
          console.log("كود ربط WhatsApp:");
          console.log(code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);
          console.log("==============================\n");
          console.log("في WhatsApp: الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف.");
        } catch (error) {
          pairingRequested = false;
          console.error("فشل إنشاء كود الربط:", error);
        }
      }

      if (connection === "open") {
        ownerJid = normalizeJid(sock.user?.id || "");
        console.log("✅ WhatsApp متصل. البوت جاهز.");
        console.log("🌍 ترجمة وفهم الرسائل مفعّلان.");
        console.log("🗣️ الردود المصرية الطبيعية مفعّلة.");
        console.log("🧠 الذاكرة + الأسماء + الوسائط + الأوامر + typing + تجميع الرسائل مفعّلة.");
        console.log(`👑 Owner JID: ${ownerJid}`);
        pairingRequested = false;
        starting = false;
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.log("اتصال WhatsApp اتقفل:", statusCode || "unknown");
        starting = false;

        if (loggedOut) {
          console.log("تم تسجيل الخروج. احذف مجلد auth_info ثم شغّل البوت من جديد للربط.");
          return;
        }

        console.log("إعادة الاتصال...");
        setTimeout(() => startWhatsApp().catch(console.error), 2000);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type, requestId }) => {
      console.log(`📡 messages.upsert: type=${type || "unknown"} count=${messages?.length || 0}${requestId ? ` requestId=${requestId}` : ""}`);
      for (const message of messages || []) await processIncomingMessage(sock, message);
    });

    sock.ev.on("messages.update", async (updates) => {
      console.log(`🔄 messages.update: count=${updates?.length || 0}`);
      for (const item of updates || []) {
        if (!item?.update?.message) continue;
        const message = { key: item.key, ...item.update };
        await processIncomingMessage(sock, message);
      }
    });
  } catch (error) {
    starting = false;
    throw error;
  }
}

console.log("=================================");
console.log(`${BOT_NAME} — Gemini + WhatsApp`);
console.log("WhatsApp: Baileys");
console.log(`AI: ${GEMINI_MODEL}`);
console.log("Translation: ON");
console.log("Egyptian style replies: ON");
console.log("Memory + media + controls: ON");
console.log("=================================");

startWhatsApp().catch((error) => {
  console.error("Startup error:", error);
  process.exit(1);
});
