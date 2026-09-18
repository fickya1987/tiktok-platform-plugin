# TikTok Platform plugin

Read TikTok creator profile and public videos via TikTok API v2 (user info + video list).

This is an installable **Cursor plugin** and portable **Agent Plugin**: one MCP server plus one skill. It targets TikTok Login Kit / Display API v2.

- Plugin name: `tiktok-platform`
- Version: `0.1.0`
- Author: tinkabot
- API base URL: `https://open.tiktokapis.com` (`Authorization: Bearer <access_token>`)

Do **not** publish this plugin to the Cursor Marketplace, a Grok marketplace, or any other catalog unless the repository owner explicitly asks.

## Requirements

- Node.js 18 or newer (`fetch` is used from the standard library; there is no MCP SDK and no npm dependencies)
- A TikTok developer app with Login Kit enabled
- A user access token from TikTok OAuth with the v0.1 scopes below
- Plugin variable `TIKTOK_ACCESS_TOKEN` (never commit this)

## Variables

Declare names only in `.cursor-plugin/plugin.json`. Values are set in the host dashboard, not in git.

| Variable | Required | Used as | Description |
| --- | --- | --- | --- |
| `TIKTOK_ACCESS_TOKEN` | yes | `Authorization: Bearer` | User access token from TikTok OAuth (Login Kit) |

Cursor: after install, open **Plugins → Configure** and set the value. The MCP process receives it as an environment variable (`${TIKTOK_ACCESS_TOKEN}` in `mcp.json`).

If the variable is missing, tools return a clear error. The server never logs token values.

## How to get an access token

Do not paste tokens into this repo, issues, or chat logs.

1. Create or open an app at [TikTok for Developers](https://developers.tiktok.com/) and enable **Login Kit**.
2. Request these scopes: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`. See [Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes).
3. Run the [Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web) authorization code flow with a registered `https` redirect URI.
4. On **your** backend, exchange the code for a user access token via [User access token management](https://developers.tiktok.com/doc/oauth-user-access-token-management) (`POST https://open.tiktokapis.com/v2/oauth/token/`). Access tokens expire (typically 24 hours) and can be refreshed with `refresh_token`.
5. Put only the user `access_token` into the plugin variable dashboard as `TIKTOK_ACCESS_TOKEN`.

This plugin does not implement OAuth itself. Keep `client_secret` and `refresh_token` on your backend — never in the plugin repo.

## Prove it in Cursor

1. Install this plugin from the git repository (Cursor **Customize / Plugins**). This repo is a single-plugin package: manifests live at the repo root (`plugin.json`, `.cursor-plugin/plugin.json`, `mcp.json`).
2. Set `TIKTOK_ACCESS_TOKEN` under **Plugins → Configure**.
3. Confirm Node 18+ is on the PATH (`node` is the MCP command).
4. In Agent chat, ask: “Fetch my TikTok creator profile with the TikTok Platform plugin.”
5. The agent should call `get_tt_user` and return a `TtUser` object from the API — not invented numbers.
6. Optional: “List my latest 5 public TikTok videos” (`list_tt_videos` with `max_count` 5).

Local MCP smoke test (no token required; tools should error clearly):

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_tt_user","arguments":{}}}' \
  | node ./server/index.mjs
```

## Grok Bot

Grok Bot loads this plugin from the **dashboard or a marketplace source**, not from a local checkout path on disk. A clone of this repository in a workspace does not, by itself, attach the MCP server to Grok Bot.

Do not publish to a Grok marketplace unless the owner asks. If the owner later installs it through a dashboard/marketplace catalog, configure the same `TIKTOK_ACCESS_TOKEN` variable there.

## Tools

Results are normalized to:

```
TtUser = { open_id, union_id, avatar_url, display_name, bio_description, profile_deep_link, is_verified, username, follower_count, following_count, likes_count, video_count }
TtVideo = { id, title, create_time, cover_image_url, share_url, video_description, duration, like_count, comment_count, share_count, view_count }
```

Only fields present in the TikTok response are included.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_tt_user` | — | `TtUser` |
| `list_tt_videos` | `max_count` (default 10, max 20), optional `cursor` | `{ videos: TtVideo[], cursor, has_more }` |

`get_tt_user` requests all user fields allowed by the v0.1 user scopes, then maps to `TtUser`. TikTok API errors surface `error.code`, `error.message`, and `error.log_id` without leaking the token.

## Out of scope (v0.1)

- `video.publish` / Direct Post
- `video.upload` / Share Kit upload
- Research API
- Data portability APIs
- Local service / commerce APIs

## Layout

```
.
├── .cursor-plugin/plugin.json   # Cursor plugin + secret variable schema
├── plugin.json                  # Agent Plugins 1.0.0 root manifest
├── mcp.json                     # stdio MCP: node ./server/index.mjs
├── skills/tiktok-platform/SKILL.md
├── server/index.mjs             # zero-dep Node stdio MCP
├── package.json
├── README.md
└── .gitignore
```

## License

Use is limited to the repository owner’s terms. Do not publish this plugin unless the owner asks.
