// ---------------------------------------------------------------------------
// Thin wrapper around the WhatsApp Cloud API "send message" endpoint.
// ---------------------------------------------------------------------------

const GRAPH_VERSION = "v26.0";

async function sendWhatsAppText({ to, body, phoneNumberId, accessToken }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("WhatsApp send failed:", res.status, errBody);
    throw new Error(`WhatsApp send failed (${res.status}): ${errBody}`);
  }

  return res.json();
}

module.exports = { sendWhatsAppText };
