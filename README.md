# WhatsApp AI Bot

WhatsApp Business Cloud API -> Vercel -> OpenAI Responses API -> WhatsApp reply.

## Endpoints
- GET /api/webhook: Meta webhook verification.
- POST /api/webhook: incoming WhatsApp messages.
- GET /api/health: health check.

## Environment variables
- VERIFY_TOKEN
- WHATSAPP_TOKEN
- PHONE_NUMBER_ID
- OPENAI_API_KEY
- OPENAI_MODEL (optional; default: gpt-5.6-luna)
- GRAPH_API_VERSION (optional; default: v23.0)
- SYSTEM_PROMPT (optional)

Never commit tokens or API keys to GitHub.

## Behavior
- Replies to incoming text messages with OpenAI.
- Keeps a short per-sender conversation context while the Vercel runtime instance is warm.
- Avoids duplicate webhook deliveries during the same runtime instance.
- Sends a fallback message if the AI call fails.
- Non-text messages receive a text notice.

## Webhook URL
https://YOUR-VERCEL-DOMAIN/api/webhook

## WhatsApp window
Free-form replies are intended for the active customer-service conversation window. Messages outside Meta's allowed window may require an approved WhatsApp message template.
