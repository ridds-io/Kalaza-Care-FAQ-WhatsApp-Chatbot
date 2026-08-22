# Kalaza Care — WhatsApp FAQ Bot

A small server that connects your FAQ knowledge base (RAG over `faq.json` +
Groq) to WhatsApp via Meta's Cloud API. Reuses the exact same retrieval logic
as the browser-based FAQ assistant, just running on a server instead of in a
tab.

## What's in here

- `server.js` — Express app with the two endpoints Meta talks to
- `retrieval.js` — TF-IDF + synonym-expansion search over `faq.json`
- `groq.js` — calls Groq with retrieved context, same system prompt as before
- `whatsapp.js` — sends replies via the WhatsApp Cloud API
- `faq.json` — your knowledge base (swap this out any time, same format as before)

## 1. Deploy to Railway

1. Push this folder to a new GitHub repo (or use Railway's "Deploy from local" / drag-and-drop option).
2. In Railway: **New Project → Deploy from GitHub repo** → select this repo.
3. Railway will detect `package.json` and run `npm install && npm start` automatically.
4. Once deployed, Railway gives you a public URL like `https://your-app.up.railway.app`.

## 2. Set environment variables in Railway

In your Railway project → **Variables** tab, add:

| Variable | Where to get it |
|---|---|
| `VERIFY_TOKEN` | Make up any string yourself, e.g. `kalaza-secret-2026` |
| `WHATSAPP_ACCESS_TOKEN` | Meta Business Suite → System Users → your system user → Generate Token (needs `whatsapp_business_management` + `whatsapp_business_messaging`) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta app dashboard → WhatsApp → API Setup → "Phone number ID" field |
| `GROQ_API_KEY` | console.groq.com → API Keys |
| `GROQ_MODEL` | Optional, defaults to `qwen/qwen3.6-27b` |

Don't set `PORT` — Railway sets it automatically.

## 3. Point Meta's webhook at your server

In your Meta app dashboard → **WhatsApp → Configuration**:

1. **Callback URL**: `https://your-app.up.railway.app/webhook`
2. **Verify token**: the exact same string you set as `VERIFY_TOKEN` in Railway
3. Click **Verify and save** — Meta will hit your `/webhook` GET endpoint once to confirm it's correctly configured; if it doesn't succeed, double check the verify token matches exactly and that your Railway deploy is live.
4. Under **Webhook fields**, subscribe to `messages`.

## 4. Test it

Message your WhatsApp test number (or your production number, once
registered) from a phone that's on your allow-list. Ask something like:

> "What is the cost?"

You should get a reply within a few seconds, synthesized across all the
relevant pricing entries in `faq.json`.

Check Railway's **Deployments → Logs** tab if something doesn't respond —
every incoming message and any errors are logged there.

## 5. Updating the FAQ data

Just replace `faq.json` with your updated file (same `{question, answer,
category}` array format) and push again — Railway will redeploy
automatically on every git push.

## Notes

- This bot only replies to messages sent to it first — it never sends
  unsolicited outbound messages, so no message templates need pre-approval.
- Groq calls typically respond in 1–3 seconds; WhatsApp itself has no strict
  reply-time requirement, but Meta may retry the webhook delivery if your
  server doesn't return a 200 quickly — that's why `server.js` responds
  `200` immediately and does the actual work afterward.
