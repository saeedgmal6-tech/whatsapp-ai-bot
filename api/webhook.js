import OpenAI from "openai";
import { waitUntil } from "@vercel/functions";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v23.0";

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
`أنت المساعد الآلي لرقم WhatsApp Business.
- رد باللغة التي يستخدمها العميل، وإذا كانت العربية فاستعمل العربية المصرية بشكل طبيعي وواضح.
- كن مختصرًا ومفيدًا.
- لا تدّعي أنك إنسان أو أنك صاحب الرقم.
- لا تخترع أسعارًا أو مواعيد أو معلومات غير موجودة.
- إذا لم تعرف الإجابة، قل إنك تحتاج معلومات إضافية أو أن موظفًا سيتابع معه.
- لا ترسل رسائل تسويقية من نفسك؛ رد على الرسالة الواردة فقط.`;

function requiredEnvOk() {
  return Boolean(
    VERIFY_TOKEN &&
    WHATSAPP_TOKEN &&
    PHONE_NUMBER_ID &&
    OPENAI_API_KEY
  );
}

async function processWebhook(body) {
  if (body?.object !== "whatsapp_business_account") return;

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;

      for (const message of value?.messages || []) {
        if (message.type !== "text") continue;

        const from = message.from;
        const incomingText = message.text?.body?.trim();

        if (!from || !incomingText) continue;

        const response = await openai.responses.create({
          model: OPENAI_MODEL,
          instructions: SYSTEM_PROMPT,
          input: incomingText,
          max_output_tokens: 500
        });

        const reply =
          response.output_text?.trim() ||
          "معلش، مقدرتش أجهز رد دلوقتي. حاول تبعت الرسالة مرة تانية.";

        await sendWhatsAppText(from, reply);
      }
    }
  }
}

async function sendWhatsAppText(to, body) {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API ${response.status}: ${errorText}`);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query?.["hub.mode"];
    const token = req.query?.["hub.verify_token"];
    const challenge = req.query?.["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge || "");
    }

    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    if (!requiredEnvOk()) {
      console.error("Missing required environment variables.");
      return res.status(500).json({ error: "Server configuration is incomplete." });
    }

    const body = req.body;

    // Acknowledge Meta immediately, while keeping the background work alive.
    res.status(200).json({ received: true });

    waitUntil(
      processWebhook(body).catch((error) => {
        console.error("Webhook processing error:", error);
      })
    );

    return;
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).send("Method Not Allowed");
}
