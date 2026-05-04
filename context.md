# Code Context

## Files Retrieved
1. `Makefile` (lines 3-5, 24-29) - `make upd` only runs `docker compose up -d --build`; no date formatting logic.
2. `docker-compose.yml` (service `cibi-api`, full file) - only builds/runs API container; no locale/date template config.
3. `Dockerfile` (builder stage lines 14-21) - builds React and copies `web/dist` into API static dir; no date format transforms.
4. `web/src/components/AccountScheduleForm.tsx` (lines 72-81) - anchor date input is native `<Input type="date">`.
5. `web/src/pages/accounts.tsx` (lines 62-68, 282-290, 307-311) - form state starts empty (`anchor_date: ''`), edit path sets date via `toDateInputValue`, submit sends raw `YYYY-MM-DD`.
6. `web/src/lib/locale.ts` (lines 11-18) - date adapter used by form (`toDateInputValue` / `fromDateInputValue`).
7. `internal/handler/pay_schedule.go` (lines 41-45, 62-63, 81-83, 123-125, 148-150) - API contract is strict `YYYY-MM-DD`; response also emits `YYYY-MM-DD`.

## Key Code
- `Makefile:27-28`
```make
upd:
	@$(DC) up -d --build
```
- `web/src/components/AccountScheduleForm.tsx:75-76`
```tsx
<Input id="schedule-anchor" type="date" value={scheduleForm.anchor_date} />
```
- `web/src/pages/accounts.tsx:65` initializes empty date:
```ts
anchor_date: ''
```
- `web/src/lib/locale.ts:11-14`
```ts
return value.includes('T') ? value.split('T')[0] : value
```
- `internal/handler/pay_schedule.go:81-83`
```go
AnchorDate: ps.AnchorDate.Format("2006-01-02")
```

## Architecture
- `make upd` -> Docker compose build/run only.
- Docker build compiles web SPA and embeds static assets into API binary image.
- UI anchor-date field is browser-native date input.
- API expects/returns `YYYY-MM-DD` for pay schedules.
- No script/template in build pipeline rewrites to `mm/dd/yyyy`.

## Start Here
Open `web/src/components/AccountScheduleForm.tsx` first.
Why: this is where `mm/dd/yyyy` is shown (native date input UI), and behavior is browser-locale-driven, not Make target logic.

## Likely root cause
`mm/dd/yyyy` is native placeholder/format hint from `<input type="date">` in an en-US browser locale. Not from `make upd`.

If you want fixed display (e.g., `YYYY-MM-DD` or `DD/MM/YYYY`) you must replace native date input with custom text/date component and formatting/parsing logic.

## Exact files/lines to edit (if fixing format behavior)
1. `web/src/components/AccountScheduleForm.tsx` lines 73-81 (anchor input type/value handling).
2. `web/src/components/TransactionForm.tsx` lines around 183-188 (same date input pattern for recurring anchor).
3. `web/src/components/PayScheduleForm.tsx` lines 90-95 (same native date input).
4. `web/src/lib/locale.ts` lines 11-18 (central parse/format helpers if moving away from native `type="date"`).
