# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- In Progress

## Current Goal

- Add a Telegram bot menu button for `/start` with the visible label `Старт`.

## Completed

- Added `npm test` and Jest dependency.
- Added tests for requests, employees, Google Sheets, and webhook behavior.
- Wired `formatTimestamp()` into request creation, request status transitions, and session `UpdatedAt` writes.
- Added focused tests covering the timestamp formatter usage.
- Fixed the stale `../trash/requests` import in `tests/requests.test.js`.
- Added a client dialog step that asks for the city before the address and saves requests with `city, address`.
- Added a focused bot flow test for the new city/address behavior.
- Added payment-sheet ID mirroring when creating a request.
- Added bot menu command registration so users can press `Старт` instead of typing `/start`.

## In Progress

- Test suite passes: 6 suites, 24 tests.

## Next Up

- Expand integration tests when functionality changes again.

## Open Questions

- Integration tests against live Telegram and Google Sheets are not part of the local suite; external APIs remain mocked.

## Architecture Decisions

- [Decisions made that affect the system design or data model - include why the decision was made]

## Session Notes

- Added the `photosLink` request column and the `Ссылки на фото документов` sheet header.
- Added Google Drive request folders named `yyyy-mm-dd_<request-id>` and employee upload flow before closing.

- `scripts/initSheets.js` and `src/sheetsClient.js` now share one Sheets auth path that supports both inline keys and `GOOGLE_APPLICATION_CREDENTIALS`.
- Category buttons are now rendered one per row so full labels remain readable; added a focused Jest test for the keyboard layout.
- Shared Google Sheets timestamp writes now use `src/dateUtils.js` across request creation, status transitions, and session persistence.
- Client request creation now asks for city before street address; saved request addresses include both values.
- New request creation appends the generated request ID to `Оплата та розрахунки` column A.
- Bot startup/setup now registers `/start` in the Telegram menu with the description `Старт`.
