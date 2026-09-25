export default function handler(req, res) {
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy — WhatsApp AI Assistant</title>
<style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h1,h2{line-height:1.25}</style>
</head><body>
<h1>Privacy Policy</h1>
<p><strong>WhatsApp AI Assistant</strong></p>
<p>Last updated: September 25, 2026</p>
<h2>Information we process</h2>
<p>When someone sends a message to the WhatsApp number connected to this service, the service may process the message text, WhatsApp user identifier, phone number and message metadata necessary to receive and respond to the message.</p>
<h2>How we use information</h2>
<p>Information is used only to receive WhatsApp messages, generate an automated response using an AI service, deliver the response through WhatsApp, and maintain the service's security and reliability.</p>
<h2>Third-party services</h2>
<p>This service uses Meta WhatsApp Cloud API and OpenAI services to process and respond to messages. Information is sent to these providers only as necessary to provide the requested messaging service and according to their applicable terms and privacy policies.</p>
<h2>Data retention</h2>
<p>The service does not intentionally retain message content longer than necessary to operate and troubleshoot the service. Operational logs may be retained for a limited period for security, reliability and debugging.</p>
<h2>Data sharing</h2>
<p>We do not sell personal information. We do not share message information with third parties except service providers required to operate the WhatsApp AI messaging service or where required by law.</p>
<h2>Contact</h2>
<p>For privacy questions or requests concerning this service, contact the service owner through the connected WhatsApp business account.</p>
</body></html>`);
}