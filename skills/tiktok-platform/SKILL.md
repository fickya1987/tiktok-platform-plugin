---
name: tiktok-platform
description: >
  Use TikTok API v2 tools for the authorized creator (profile + public video
  list). Use when the user asks about TikTok Login Kit / Display API user info
  or videos. Never invent profile or video data. Not for publish, upload,
  research, portability, or local commerce APIs.
---

# TikTok Platform

Work with the **authorized TikTok user** through TikTok API v2 (Login Kit /
Display API). Tools talk to `https://open.tiktokapis.com` with
`Authorization: Bearer <TIKTOK_ACCESS_TOKEN>`.

v0.1 scopes only: `user.info.basic`, `user.info.profile`, `user.info.stats`,
`video.list`.

## When to use

- Fetch the connected creator profile (`get_tt_user`)
- List the connected user's public videos (`list_tt_videos`)

Do **not** use these tools to publish or upload video, query Research API,
request data portability exports, or call local service / commerce APIs.
Those are out of scope for v0.1.

## Never invent data

- Call a tool whenever the user asks for live TikTok profile or video data.
- If a tool fails or `TIKTOK_ACCESS_TOKEN` is missing, report the error. Do
  not guess display names, bios, follower counts, video titles, view counts,
  or share URLs.
- Do not echo, log, or paste `TIKTOK_ACCESS_TOKEN` or other secrets.

## Tools and result shapes

Normalize explanations to these objects (tools already return them; omitted
fields were not present in the API response):

```
TtUser = { open_id, union_id, avatar_url, display_name, bio_description, profile_deep_link, is_verified, username, follower_count, following_count, likes_count, video_count }
TtVideo = { id, title, create_time, cover_image_url, share_url, video_description, duration, like_count, comment_count, share_count, view_count }
```

| Tool | Arguments | Result |
| --- | --- | --- |
| `get_tt_user` | (none) | `TtUser` |
| `list_tt_videos` | `max_count` (default 10, max 20), optional `cursor` | `{ videos: TtVideo[], cursor, has_more }` |

If `has_more` is true, pass the returned `cursor` to the next
`list_tt_videos` call. Do not invent a cursor.

## TikTok developer app + OAuth (no secrets)

Operators configure `TIKTOK_ACCESS_TOKEN` in the host dashboard (Cursor:
**Plugins → Configure**). Do not ask them to paste tokens into the repo or
into skill files.

High-level setup:

1. Create a TikTok developer app and enable Login Kit at
   [TikTok for Developers](https://developers.tiktok.com/).
2. Request the v0.1 scopes listed below and complete the user OAuth
   authorization code flow.
3. Exchange the authorization code for a user access token on the operator's
   backend. Put only that user access token into the plugin variable
   dashboard.

Official docs:

- [Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes)
- [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info)
- [List Videos](https://developers.tiktok.com/doc/tiktok-api-v2-video-list)
- [Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web)
- [User access token management](https://developers.tiktok.com/doc/oauth-user-access-token-management)

Required v0.1 scopes: `user.info.basic`, `user.info.profile`,
`user.info.stats`, `video.list`.
