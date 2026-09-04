# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- In Progress

## Current Goal

- Keep the bot UI and Google Sheets headers/status values in one code-selected language via `mainLang`.

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
- Renamed the `Заявки` sheet header from `Имя клиента` to `Client Telegram name`.
- Renamed the `Заявки` sheet header from `Удобное время` to `Срок исполнения`.
- Replaced the client request prompt after address with `Укажите крайний срок выполнения работ`.
- Added a client-name step after category selection and save its value to the `Клиент` request column.
- Added the `Количество заявок` column to `Database`; new request IDs now use the category code, current date, and incremented category counter.
- Removed leading zero padding from the request counter in IDs: `КОДYYYYMMDD_N`.
- Removed the `Активен (да/нет)` column from `Database`; a non-empty city value now means the city is active.
- Changed `Database!D2` to a single global request counter; request IDs now use the total request number regardless of category.
- Simplified the client notification shown when a request is taken into work.

- Added a photo-confirmation reminder to the employee notification after taking a request; it remains visible after marking departure.
- Added the contractual client name to employee request cards between deadline and client phone.
- Renamed the employee request card deadline label from `Крайний срок` to `Срок исполнения`.
- New request rows in `Заявки` now clear inherited Google Sheets formatting after append.
- Replaced the `Города` sheet with a `Database` sheet containing city status, category names, and category codes; client category buttons now load from `Список категорий`.
- Changed the `Сотрудники` sheet to store one row per employee with semicolon-separated `Категории` and `Города`; `*` matches all categories or cities.
- Added code-selected Russian/Ukrainian localization through `src/config.js`, `src/i18n.js`, and `src/locales`.
- Localized bot messages, buttons, notifications, request statuses, and `init-sheets.js` headers using `mainLang`.
- Updated the fallback Russian/Ukrainian category lists to the current 10 service categories.

## In Progress

- Focused city/category/Sheets tests pass: 3 suites, 8 tests.
- Full `npm test` currently fails in 2 existing `tests/bot.test.js` expectations around employee status text and close prerequisites.

## Next Up

- Expand integration tests when functionality changes again.

## Open Questions

- Integration tests against live Telegram and Google Sheets are not part of the local suite; external APIs remain mocked.
- Existing production employees must be migrated to the new `Категории`, `Города`, and `Активен (да/нет)` columns; active cities/categories must be added to `Database`.

## Architecture Decisions

- Store one employee per row; keep multiple categories and cities as semicolon-separated values, with `*` representing all. This avoids duplicate employee rows and avoids category-city combinations.
- Use one global language selected in code (`mainLang = "ru"` or `"uk"`) for all bot users; do not store per-user language preferences.

## Session Notes

- Добавлен рабочий скрипт `scripts/deleteWebhook.js` для удаления Telegram webhook через `npm run delete-webhook`; команда документирована в README.

- Обновлён `context/project-overview.md`: описание приведено в соответствие с текущим MVP — динамические города и категории, многозначные привязки сотрудников, глобальный счётчик ID, Google Drive-файлы, обязательные данные для закрытия и текущие ограничения тестирования.

- Added dynamic city selection from the `Города` sheet, separate request city storage, and exact category-plus-city employee matching.
- Employee rows now include `Город`; multiple active rows can assign multiple cities to one employee.
- Reordered request columns so `Город` is between `Описание` and `Адрес`; added `Telegram name` after `Telegram ID` in `Сотрудники`.
- City selection buttons now render two per row, and the Telegram menu label for `/start` is `Оставить заявку`.
- Production webhook now refreshes Telegram menu commands once per serverless instance, so the client sees the updated `Оставить заявку` label.

- The completion keyboard now reloads the saved material cost after file upload, preserving its ✅ marker.
- Request closing now also requires successfully attached files.
- Closed requests now display only the final status with the request number.
- Non-numeric material-cost input now prompts the employee to enter the amount using digits.
- Material costs are converted to numeric values before being written to Google Sheets.
- The final closed-request status now displays the green check mark.
- Completion input now uses separate success messages for work descriptions and material costs.
- The file-upload button now changes to ✅ after a successful upload.

- Completion now requires a work description and material cost; the description is saved to the requests sheet, and the cost to column J of the payment sheet.

- Employee request cards now show `Клиент` between `Срок исполнения` and `Телефон клиента`.

- Employee request status messages now keep a photo-confirmation reminder between the taken and departed status lines.

- Added the `photosLink` request column and the `Ссылки на фото документов` sheet header.
- Added Google Drive request folders named `yyyy-mm-dd_<request-id>` and employee upload flow before closing.
- Improved Drive upload diagnostics and added Shared Drive request support.

- `scripts/initSheets.js` and `src/sheetsClient.js` now share one Sheets auth path that supports both inline keys and `GOOGLE_APPLICATION_CREDENTIALS`.
- Category buttons are now rendered one per row so full labels remain readable; added a focused Jest test for the keyboard layout.
- Shared Google Sheets timestamp writes now use `src/dateUtils.js` across request creation, status transitions, and session persistence.
- Client request creation now asks for city before street address; saved request addresses include both values.
- New request creation appends the generated request ID to `Оплата та розрахунки` column A.
- Bot startup/setup now registers `/start` in the Telegram menu with the description `Старт`.
- `scripts/initSheets.js` now creates the `Заявки` sheet with `Client Telegram name` instead of `Имя клиента`.
- `scripts/initSheets.js` now creates the `Заявки` sheet with `Срок исполнения` instead of `Удобное время`.
- Client request flow now asks for the work deadline after the address step.
- Client request flow now asks for the contractual customer name after category selection.
- `Заявки` now includes the `Клиент` column immediately after `Client Telegram name`.
- Appending to `Заявки` now resets the appended row's `userEnteredFormat` so status highlighting from the previous row is not copied to new requests.
