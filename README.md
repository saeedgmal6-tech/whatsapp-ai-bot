# WhatsApp AI Auto Reply — Personal Android/Termux

This branch connects a personal WhatsApp account as a linked device and generates automatic replies with OpenAI.

## Important

This uses Baileys, an unofficial WhatsApp Web client. It is not Meta's official WhatsApp Cloud API. WhatsApp may restrict or suspend accounts using unofficial automation. Use a secondary/test number if protecting your primary number is important.

## Android-only setup

1. Install Termux from a trusted source such as F-Droid.
2. In Termux run: `pkg update && pkg install nodejs git -y`
3. Clone this branch:
`git clone -b mobile-personal-whatsapp https://github.com/saeedgmal6-tech/whatsapp-ai-bot.git`
4. Enter it: `cd whatsapp-ai-bot`
5. Install: `npm install`
6. Create config: `cp .env.example .env`
7. Edit `.env` and set `OPENAI_API_KEY` and `WHATSAPP_NUMBER`.
8. Start: `npm start`
9. The bot prints a pairing code. In WhatsApp: Settings > Linked Devices > Link a Device > Link with phone number instead, then enter the code.

The WhatsApp session is saved in `auth_info`, so you normally do not pair again after the first successful login.

## Controls

- `BOT_ENABLED=true` automatic replies.
- `REPLY_GROUPS=false` ignore groups.
- `ALLOWED_NUMBERS=2010...,2011...` reply only to selected contacts. Empty means all private chats.
- `SYSTEM_PROMPT` controls the AI personality.

## Phone-only operation

Keep Termux running. Android battery optimization can stop background processes, so exclude Termux from battery optimization and use a wake lock when continuous operation is needed.

## OpenAI

The bot uses the OpenAI API. A ChatGPT subscription does not by itself include API credits; API usage is billed separately.
