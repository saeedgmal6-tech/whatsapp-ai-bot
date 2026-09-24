# WhatsApp AI Auto Reply — Android / Termux

Personal WhatsApp linked-device bot using Baileys + OpenAI.

## What this version does

- Uses Baileys 7.0.0-rc14 with the current WhatsApp Web version.
- Uses cached Signal keys.
- Uses a retry cache and local message store.
- Disables automatic history synchronization to avoid unnecessary history/protocol traffic.
- Handles normal text, extended text, and captions.
- Keeps a short per-chat conversation context.
- Replies in natural Egyptian Arabic by default.
- Uses GPT-5.6 Luna through the OpenAI Responses API.
- Ignores groups unless REPLY_GROUPS=true.
- Can restrict replies with ALLOWED_NUMBERS.

## First setup

1. Put your OpenAI API key and WhatsApp number in .env.
2. Start with:
   npm start
3. If this is a fresh session, pair the displayed code from:
   WhatsApp > Settings > Linked Devices > Link with phone number instead

The session is stored in auth_info.

## Important

This uses an unofficial WhatsApp Web client. WhatsApp can change its protocol and can restrict automated accounts. Do not commit auth_info or .env.

For continuous Android operation, keep Termux running and exclude it from Android battery optimization.

## Security

Never paste your OpenAI API key or the auth_info directory into chat, GitHub, screenshots, or support tickets.
