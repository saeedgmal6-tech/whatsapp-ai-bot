export default async function handler(req, res) {
  const verifyToken = process.env.VERIFY_TOKEN;

  if (req.method === "GET") {
    const url = new URL(req.url, "https://vercel.local");
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

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