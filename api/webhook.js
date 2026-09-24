export default async function handler(req, res) {
  const verifyToken = process.env.VERIFY_TOKEN;

  if (req.method === "GET") {
    const mode = req.query && req.query["hub.mode"];
    const token = req.query && req.query["hub.verify_token"];
    const challenge = req.query && req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      return res.status(200).send(challenge || "");
    }

    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    return res.status(200).json({ received: true });
  }

  return res.status(405).send("Method Not Allowed");
}