# WhatsApp AI Auto Reply

This is a small Node.js/Express webhook that:
1. Receives incoming WhatsApp Cloud API webhook events.
2. Sends incoming text to the OpenAI Responses API.
3. Sends the generated reply back through WhatsApp Cloud API.

## Render settings

Runtime: Node
Build Command: `npm install`
Start Command: `npm start`

## Required environment variables

Do NOT put secrets in the code or GitHub.

- `VERIFY_TOKEN` — any private random string you choose; use the exact same value in Meta Webhooks.
- `WHATSAPP_TOKEN` — Meta WhatsApp access token.
- `PHONE_NUMBER_ID` — Meta WhatsApp phone number ID.
- `OPENAI_API_KEY` — OpenAI API key.
- `OPENAI_MODEL` — optional; default is `gpt-5.6-luna`.
- `GRAPH_API_VERSION` — optional; use the Graph API version shown/required by your Meta app.
- `SYSTEM_PROMPT` — optional; customize the bot's behavior.

Webhook URL:
`https://YOUR-RENDER-SERVICE.onrender.com/webhook`

Health URL:
`https://YOUR-RENDER-SERVICE.onrender.com/`
