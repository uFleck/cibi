# Progress

## Status
In Progress

## Tasks

### PIX QR Code (BR Code/EMV) + Friend PIX self-edit
- [x] Backend: Add `UpdatePixKeyByToken` to FriendService
- [x] Backend: Add `UpdatePixKey` handler to PublicHandler
- [x] Backend: Register `PATCH /public/friend/:token/pix-key` route
- [x] Backend: Add `friend_pix_key` to PublicFriendResponse (handler + service + TS type)
- [x] Frontend: Install `qrcode` npm package
- [x] Frontend: Create `web/src/lib/pix-qrcode.ts` (proper BR Code/EMV payload with CRC16-CCITT)
- [x] Frontend: Create `web/src/components/PixQrCode.tsx`
- [x] Frontend: Add `updatePublicFriendPixKey` to api.ts
- [x] Frontend: Update `group-public.tsx` with QR code toggle
- [x] Frontend: Update `friend-public.tsx` with PIX self-edit card + QR codes in group rows
- [x] Backend compiles clean (`go build ./...`)
- [x] Frontend type-checks clean (`tsc --noEmit`)

## Files Changed
- `internal/handler/public.go`
- `internal/handler/routes.go`
- `internal/service/friend.go`
- `web/src/lib/api.ts`
- `web/src/lib/pix-qrcode.ts` (new)
- `web/src/components/PixQrCode.tsx` (new)
- `web/src/pages/group-public.tsx`
- `web/src/pages/friend-public.tsx`

## Notes
- Pre-existing test failure in `category-autofill.test.ts`: `'mensalidade escolar do colegio'` matches Subscriptions before Education due to keyword ordering. Not caused by PIX changes.
