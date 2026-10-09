# Tailscale tunnel URL for “Copy URL”

## What changed

- `Copy URL` (Friends + Group Events) now prefers your saved **Public base URL**.
- If empty, it falls back to current browser origin (old behavior).

## Process

1. Open app → **Settings** → **Profile preferences**.
2. Fill **Public base URL** with your Tailscale URL (example: `https://your-node.your-tailnet.ts.net`).
3. Click **Save preferences**.
4. Go to **Friends** page and use **Copy URL**.
5. Copied link now uses your Tailscale base URL:
   - Friend: `https://.../public/friend/<token>`
   - Group: `https://.../public/group/<token>`

## Notes

- URL is saved per account profile.
- Trailing slash is normalized automatically.
- Field validates for `http://` or `https://` URL.
- Clear the field to return to browser-origin links.
