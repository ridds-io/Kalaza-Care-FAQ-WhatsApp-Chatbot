require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");

const { createRetriever } = require("./retrieval");
const { askGroq } = require("./groq");
const { sendWhatsAppText } = require("./whatsapp");

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Config — all read from environment variables, set these in Railway.
// ---------------------------------------------------------------------------
const {
  VERIFY_TOKEN,          // any string you choose, must match what you type into Meta's dashboard
  WHATSAPP_ACCESS_TOKEN, // permanent token from your System User
  WHATSAPP_PHONE_NUMBER_ID, // from WhatsApp > API Setup in the Meta app dashboard
  GROQ_API_KEY,
  GROQ_MODEL,            // optional, defaults to llama-3.3-70b-versatile
  PORT,
} = process.env;

// ---------------------------------------------------------------------------
// Load the FAQ knowledge base and build the retriever once at startup.
// Swap faq.json for your own file any time — same {question, answer} shape
// used in the browser version.
// ---------------------------------------------------------------------------
const faqPath = path.join(__dirname, "faq.json");
const kb = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
const retriever = createRetriever(kb);
console.log(`Loaded ${kb.length} FAQ entries from faq.json`);

// De-dupes WhatsApp's occasional repeated webhook deliveries for the same message.
const seenMessageIds = new Set();

// ---------------------------------------------------------------------------
// GET /webhook — Meta calls this once to verify you own the endpoint.
// ---------------------------------------------------------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// POST /webhook — Meta calls this every time a message comes in.
// ---------------------------------------------------------------------------
app.post("/webhook", async (req, res) => {
  // Always acknowledge quickly so Meta doesn't retry/timeout.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return; // status update / read receipt / etc — nothing to do

    if (seenMessageIds.has(message.id)) return;
    seenMessageIds.add(message.id);

    const from = message.from; // sender's WhatsApp number
    const text = message.text?.body;

    if (!text) {
      await sendWhatsAppText({
        to: from,
        body: "I can only answer text questions right now — could you type your question?",
        phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
        accessToken: WHATSAPP_ACCESS_TOKEN,
      });
      return;
    }

    console.log(`Incoming from ${from}: ${text}`);

    const matches = retriever.retrieveTopK(text, 8);
    const answer = await askGroq({
      question: text,
      matches,
      apiKey: GROQ_API_KEY,
      model: GROQ_MODEL,
    });

    await sendWhatsAppText({
      to: from,
      body: answer,
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
      accessToken: WHATSAPP_ACCESS_TOKEN,
    });

    console.log(`Replied to ${from}`);
  } catch (err) {
    console.error("Error handling webhook event:", err);
    // Best-effort apology back to the user if we know who they are.
    try {
      const from = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      if (from) {
        await sendWhatsAppText({
          to: from,
          body: "Sorry, something went wrong on our end. Please try again in a moment, or contact Kalaza Care directly.",
          phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
          accessToken: WHATSAPP_ACCESS_TOKEN,
        });
      }
    } catch (sendErr) {
      console.error("Failed to send error notice:", sendErr);
    }
  }
});

// Simple health check — useful for confirming the Railway deploy is alive.
app.get("/", (req, res) => {
  res.send("Kalaza Care WhatsApp bot is running.");
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
