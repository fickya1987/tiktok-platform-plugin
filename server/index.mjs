#!/usr/bin/env node
/**
 * Zero-dependency stdio MCP server for TikTok API v2 (user info + video list).
 * JSON-RPC 2.0 over newline-delimited stdin/stdout. Never log tokens.
 */
import readline from "node:readline";

const SERVER_NAME = "tiktok-platform";
const SERVER_VERSION = "0.1.0";
const API_BASE = "https://open.tiktokapis.com";
const PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
]);

/** Fields allowed by user.info.basic + user.info.profile + user.info.stats. */
const USER_FIELDS = [
  "open_id",
  "union_id",
  "avatar_url",
  "avatar_url_100",
  "avatar_large_url",
  "display_name",
  "bio_description",
  "profile_deep_link",
  "profile_web_link",
  "is_verified",
  "username",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
].join(",");

const TT_USER_KEYS = [
  "open_id",
  "union_id",
  "avatar_url",
  "display_name",
  "bio_description",
  "profile_deep_link",
  "is_verified",
  "username",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
];

const VIDEO_FIELDS = [
  "id",
  "title",
  "create_time",
  "cover_image_url",
  "share_url",
  "video_description",
  "duration",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
].join(",");

const TT_VIDEO_KEYS = [
  "id",
  "title",
  "create_time",
  "cover_image_url",
  "share_url",
  "video_description",
  "duration",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
];

const TOOLS = [
  {
    name: "get_tt_user",
    description:
      "Get the authorized TikTok creator profile as TtUser via GET /v2/user/info/.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_tt_videos",
    description:
      "List the authorized user's public TikTok videos as TtVideo[] via POST /v2/video/list/. Default max_count 10 (max 20).",
    inputSchema: {
      type: "object",
      properties: {
        max_count: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 10,
          description:
            "Maximum number of videos to return per page (default 10, max 20).",
        },
        cursor: {
          type: "integer",
          description:
            "Optional pagination cursor from a previous list_tt_videos call (UTC Unix timestamp in milliseconds).",
        },
      },
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function redactSecrets(value) {
  let text = String(value ?? "");
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (token) {
    text = text.split(token).join("[REDACTED]");
  }
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/access_token=[^&\s"'\\]+/gi, "access_token=[REDACTED]");
}

function missingEnv() {
  const missing = [];
  if (!String(process.env.TIKTOK_ACCESS_TOKEN ?? "").trim()) {
    missing.push("TIKTOK_ACCESS_TOKEN");
  }
  return missing;
}

function requireEnv() {
  const missing = missingEnv();
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. Set them in Cursor Plugins → Configure (or the host plugin variable dashboard). Do not put secrets in the repo.`,
    );
  }
}

function pickPresent(source, keys) {
  const out = {};
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

function shapeUser(user) {
  return pickPresent(user, TT_USER_KEYS);
}

function shapeVideo(video) {
  return pickPresent(video, TT_VIDEO_KEYS);
}

function formatTikTokError(payload, status) {
  const err = payload?.error;
  if (!err || typeof err !== "object") {
    return `TikTok API request failed (HTTP ${status}).`;
  }
  const parts = [`TikTok API error (HTTP ${status})`];
  if (err.code != null && err.code !== "") {
    parts.push(`code ${err.code}`);
  }
  if (err.message) {
    parts.push(String(err.message));
  }
  if (err.log_id) {
    parts.push(`log_id ${err.log_id}`);
  }
  return redactSecrets(parts.join(": "));
}

function isTikTokOk(payload) {
  const code = payload?.error?.code;
  return code == null || code === "" || code === "ok";
}

async function tiktokRequest(path, { method = "GET", query = {}, body } = {}) {
  requireEnv();
  const url = new URL(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
  };
  let encodedBody;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    encodedBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: encodedBody,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `TikTok API network error: ${redactSecrets(error?.message ?? error)}`,
    );
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `TikTok API returned non-JSON (HTTP ${response.status}).`,
    );
  }

  if (!response.ok || !isTikTokOk(payload)) {
    throw new Error(formatTikTokError(payload, response.status));
  }
  return payload;
}

function parseMaxCount(args) {
  const raw = args?.max_count ?? 10;
  const maxCount = Number(raw);
  if (!Number.isInteger(maxCount) || maxCount < 1 || maxCount > 20) {
    throw new Error("max_count must be an integer between 1 and 20");
  }
  return maxCount;
}

function parseCursor(args) {
  if (args?.cursor == null || args.cursor === "") {
    return undefined;
  }
  const cursor = Number(args.cursor);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("cursor must be a non-negative integer (Unix ms timestamp)");
  }
  return cursor;
}

async function handleTool(name, args = {}) {
  switch (name) {
    case "get_tt_user": {
      const payload = await tiktokRequest("/v2/user/info/", {
        query: { fields: USER_FIELDS },
      });
      return shapeUser(payload?.data?.user ?? {});
    }
    case "list_tt_videos": {
      const maxCount = parseMaxCount(args);
      const cursor = parseCursor(args);
      const body = { max_count: maxCount };
      if (cursor !== undefined) {
        body.cursor = cursor;
      }
      const payload = await tiktokRequest("/v2/video/list/", {
        method: "POST",
        query: { fields: VIDEO_FIELDS },
        body,
      });
      const data = payload?.data ?? {};
      const videos = Array.isArray(data.videos)
        ? data.videos.map(shapeVideo)
        : [];
      const result = {
        videos,
        has_more: Boolean(data.has_more),
      };
      if (data.cursor !== undefined && data.cursor !== null) {
        result.cursor = data.cursor;
      }
      return result;
    }
    default:
      return null;
  }
}

function initializeResult(params) {
  const requested = params?.protocolVersion;
  const protocolVersion = PROTOCOL_VERSIONS.has(requested)
    ? requested
    : "2024-11-05";
  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions:
      "TikTok API v2 tools for the authorized creator (user info + public video list). Requires TIKTOK_ACCESS_TOKEN. Never invent profile or video values; call tools instead. Do not log or echo access tokens. v0.1 scopes: user.info.basic, user.info.profile, user.info.stats, video.list.",
  };
}

async function dispatch(message) {
  const { id, method, params } = message;
  if (id === undefined) {
    return;
  }
  if (typeof method !== "string") {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid Request" },
    });
    return;
  }

  switch (method) {
    case "initialize":
      send({ jsonrpc: "2.0", id, result: initializeResult(params) });
      return;
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    case "tools/list":
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    case "tools/call": {
      const name = params?.name;
      if (typeof name !== "string" || !name) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing tool name" },
        });
        return;
      }
      if (!TOOLS.some((tool) => tool.name === name)) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${name}` },
        });
        return;
      }
      try {
        const result = await handleTool(name, params.arguments ?? {});
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: redactSecrets(JSON.stringify(result, null, 2)),
              },
            ],
          },
        });
      } catch (error) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: redactSecrets(error?.message ?? String(error)),
              },
            ],
            isError: true,
          },
        });
      }
      return;
    }
    default:
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}

const missingAtBoot = missingEnv();
if (missingAtBoot.length) {
  console.error(
    `${SERVER_NAME}: missing ${missingAtBoot.join(" and ")}. Tools will return a clear error until they are set.`,
  );
}

let pending = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) {
    process.exit(0);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  for (const message of messages) {
    pending += 1;
    Promise.resolve(dispatch(message))
      .catch((error) => {
        if (message?.id !== undefined) {
          send({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32603,
              message: redactSecrets(error?.message ?? "Internal error"),
            },
          });
        }
      })
      .finally(() => {
        pending -= 1;
        maybeExit();
      });
  }
});
rl.on("close", () => {
  stdinClosed = true;
  maybeExit();
});
