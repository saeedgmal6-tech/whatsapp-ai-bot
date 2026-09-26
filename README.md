# WhatsApp AI Bot — بدون Meta

بوت WhatsApp يعمل مباشرة كجهاز WhatsApp Web إضافي باستخدام Baileys، ثم يرسل الرسائل إلى OpenRouter ويعيد رد الذكاء الاصطناعي إلى نفس المحادثة.

## المكونات

WhatsApp على الهاتف → Baileys → Gemini → WhatsApp

لا يحتاج:
- Meta Business
- WhatsApp Cloud API
- WABA
- Webhooks
- App Review

## الذكاء الاصطناعي المجاني

الإعداد الحالي يستخدم Gemini للردود وفهم الرسائل.

## التثبيت على Termux

بعد تثبيت Termux:

```bash
pkg update -y
pkg install nodejs git -y
git clone https://github.com/saeedgmal6-tech/whatsapp-ai-bot.git
cd whatsapp-ai-bot
npm install
```

## المتغيرات

```bash
export PHONE_NUMBER=رقم_واتساب_بدون_علامة_+
export OPENROUTER_API_KEY=مفتاحك
export OPENROUTER_MODEL=openrouter/free
```

ثم:

```bash
npm start
```

سيظهر **Pairing Code** في الشاشة، وليس QR.

في WhatsApp:
الأجهزة المرتبطة → ربط جهاز → الربط برقم الهاتف

أدخل الكود الظاهر في Termux.

بعد نجاح الربط ستظهر:
`✅ WhatsApp متصل. البوت جاهز.`

## الجلسة

بيانات تسجيل الدخول تحفظ محليًا في:
`./auth_info`

بعد أول ربط لا تحتاج إلى إعادة إدخال الكود عند كل تشغيل طالما مجلد الجلسة موجود.

## السلوك

- يرد على الرسائل النصية.
- يحافظ على سياق قصير لكل محادثة.
- يتجاهل رسائل البوت نفسه.
- يتجاهل المجموعات افتراضيًا.
- لا يبدأ محادثات من نفسه.
- يفهم الرسائل والوسائط المدعومة ويرد عليها حسب محتواها.
- إعادة الاتصال تلقائية عند انقطاع الاتصال.

## ملاحظة مهمة

Baileys طريقة غير رسمية للتعامل مع WhatsApp Web وليست WhatsApp Cloud API. استخدامها قد تخضع لقيود أو تغييرات من WhatsApp، لذلك لا يوجد ضمان بأن الرقم لن يتعرض لتقييد.

## Termux

يفضل تثبيت Termux من مصدر رسمي مثل F-Droid أو GitHub Releases، وعدم خلط نسخة Termux أو الإضافات من مصادر مختلفة.
