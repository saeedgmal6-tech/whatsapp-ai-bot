import OpenAI from "openai";

export default async function handler(req, res) {
  const verifyToken = process.env.VERIFY_TOKEN;
  const whatsappToken = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message || message.type !== "text") {
      return res.status(200).json({ received: true });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const result = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      messages: [
        {
          role: "system",
          content: process.env.SYSTEM_PROMPT || "You are a helpful WhatsApp assistant. Reply in the same language as the user."
        },
        {
          role: "user",
          content: message.text?.body || ""
        }
      ]
    });

    const reply =
      result.choices?.[0]?.message?.content?.trim() ||
      "معلش، مقدرتش أجهز رد دلوقتي.";

    await fetch(
      "https://graph.facebook.com/" +
        (process.env.GRAPH_API_VERSION || "v23.0") +
        "/" +
        phoneNumberId +
        "/messages",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + whatsappToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.from,
          type: "text",
          text: { body: reply }
        })
      }
    );

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(200).json({ received: true });
  }
}