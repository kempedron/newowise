import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";
import http from "node:http";

function request(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: opts.method || "POST", headers: opts.headers || {} },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      }
    );
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

async function withServer(fn) {
  const app = createApp();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const port = app.address().port;
  try {
    return await fn(port);
  } finally {
    app.close();
  }
}

describe("POST /api/triage", () => {
  test("missing text returns 400 invalid_input", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({}) });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(JSON.parse(res.body).status, "invalid_input");
    });
  });

  test("empty text returns 400 invalid_input", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: "" }) });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(JSON.parse(res.body).status, "invalid_input");
    });
  });

  test("non-string text returns 400 invalid_input", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: 123 }) });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(JSON.parse(res.body).status, "invalid_input");
    });
  });

  test("bad JSON returns 400 invalid_input", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: "{not json", headers: { "Content-Type": "application/json" } });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(JSON.parse(res.body).status, "invalid_input");
    });
  });

  test("valid delivery request returns ready", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: "Когда доставите заказ?" }) });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, "ready");
      assert.strictEqual(body.topic, "delivery");
      assert.ok(typeof body.draft === "string" && body.draft.trim().length > 0);
    });
  });

  test("model timeout returns 200 manual_review", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: "[timeout] вопрос" }) });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, "manual_review");
      assert.strictEqual(body.topic, null);
      assert.strictEqual(body.draft, null);
    });
  });

  test("model error returns 200 manual_review", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: "[error] вопрос" }) });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, "manual_review");
      assert.strictEqual(body.topic, null);
      assert.strictEqual(body.draft, null);
    });
  });

  test("bad topic from model returns 200 manual_review", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: "[bad-topic] вопрос" }) });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, "manual_review");
      assert.strictEqual(body.topic, null);
      assert.strictEqual(body.draft, null);
    });
  });

  test("empty draft from model returns 200 manual_review", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: "[empty-draft] вопрос" }) });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, "manual_review");
      assert.strictEqual(body.topic, null);
      assert.strictEqual(body.draft, null);
    });
  });

  test("bad JSON from model returns 200 manual_review", async (t) => {
    await withServer(async (port) => {
      const res = await request(port, "/api/triage", { body: JSON.stringify({ text: "[bad-json] вопрос" }) });
      assert.strictEqual(res.status, 200);
      const body = JSON.parse(res.body);
      assert.strictEqual(body.status, "manual_review");
      assert.strictEqual(body.topic, null);
      assert.strictEqual(body.draft, null);
    });
  });
});
