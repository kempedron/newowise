import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));

const ALLOWED_TOPICS = new Set(["delivery", "pricing", "other"]);
const MODEL_TIMEOUT_MS = 300;

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function invalidInput(response) {
  json(response, 400, { status: "invalid_input" });
}

function manualReview(response) {
  json(response, 200, { status: "manual_review", topic: null, draft: null });
}

function isValidModelResult(result) {
  return (
    result !== null &&
    typeof result === "object" &&
    typeof result.topic === "string" &&
    ALLOWED_TOPICS.has(result.topic) &&
    typeof result.draft === "string" &&
    result.draft.trim().length > 0
  );
}

async function handleTriage(request, response) {
  let body;
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return invalidInput(response);
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return invalidInput(response);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const raw = await classify(body.text, { signal: controller.signal });
    clearTimeout(timeoutId);
    const result = JSON.parse(raw);
    if (!isValidModelResult(result)) {
      return manualReview(response);
    }
    return json(response, 200, { status: "ready", topic: result.topic, draft: result.draft });
  } catch {
    clearTimeout(timeoutId);
    return manualReview(response);
  }
}

function createApp() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response);
    } catch {
      json(response, 500, { status: "server_error" });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(Number(process.env.PORT || 3000), "127.0.0.1");
}

export { createApp, handleTriage };
