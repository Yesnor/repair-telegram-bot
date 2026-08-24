# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Complete

## Current Goal

- Add a city prompt before address entry and save city as part of the request address.

## Completed

- Added `npm test` and Jest dependency.
- Added tests for requests, employees, Google Sheets, and webhook behavior.
- Wired `formatTimestamp()` into request creation, request status transitions, and session `UpdatedAt` writes.
- Added focused tests covering the timestamp formatter usage.
- Fixed the stale `../trash/requests` import in `tests/requests.test.js`.
- Added a client dialog step that asks for the city before the address and saves requests with `city, address`.
- Added a focused bot flow test for the new city/address behavior.

## In Progress

- Test suite passes: 6 suites, 23 tests.

## Next Up

- Expand integration tests when functionality changes again.

## Open Questions

- Integration tests against live Telegram and Google Sheets are not part of the local suite; external APIs remain mocked.

## Architecture Decisions

- [Decisions made that affect the system design or data model - include why the decision was made]

## Session Notes

- `scripts/initSheets.js` and `src/sheetsClient.js` now share one Sheets auth path that supports both inline keys and `GOOGLE_APPLICATION_CREDENTIALS`.
- Category buttons are now rendered one per row so full labels remain readable; added a focused Jest test for the keyboard layout.
- Shared Google Sheets timestamp writes now use `src/dateUtils.js` across request creation, status transitions, and session persistence.
- Client request creation now asks for city before street address; saved request addresses include both values.
