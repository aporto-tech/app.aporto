import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

const baseUrl = process.env.NEWAPI_URL;
const adminToken = process.env.NEWAPI_ADMIN_TOKEN;
const adminUser = process.env.NEWAPI_ADMIN_USER ?? "1";

if (!baseUrl) {
  throw new Error("NEWAPI_URL is required");
}

if (!adminToken || adminToken === "changeme_after_first_boot") {
  throw new Error("NEWAPI_ADMIN_TOKEN is required");
}

const channelIds = [217, 218];

function apiUrl(path) {
  return new URL(path, baseUrl).toString();
}

async function requestJson(path, init = {}) {
  const url = apiUrl(path);
  console.log(`[newapi] ${init.method || "GET"} ${url}`);

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "New-Api-User": adminUser,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Expected JSON from ${path}, got: ${text.slice(0, 200)}`);
    }
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status} ${response.statusText} ${text}`);
  }

  return body;
}

async function ensureChannelEnabled(id) {
  const channel = await requestJson(`/api/channel/${id}`);
  const status = channel?.data?.status ?? channel?.status;
  console.log(`[newapi] channel ${id} current status: ${status ?? "unknown"}`);

  if (status === 1 || status === "1") {
    console.log(`Channel ${id} already enabled`);
    return;
  }

  console.log(`[newapi] enabling channel ${id} with payload: ${JSON.stringify({ id, status: 1 })}`);
  await requestJson(`/api/channel/`, {
    method: "PUT",
    body: JSON.stringify({ id, status: 1 })
  });

  console.log(`Channel ${id} enabled`);
}

try {
  for (const id of channelIds) {
    await ensureChannelEnabled(id);
  }
} finally {
  // no-op
}
