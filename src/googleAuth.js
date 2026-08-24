const { google } = require("googleapis");

const SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"];

function createSheetsAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!email) {
    throw new Error("Set GOOGLE_SERVICE_ACCOUNT_EMAIL in .env before using Google Sheets.");
  }

  if (privateKey) {
    return new google.auth.JWT({
      email,
      key: privateKey,
      scopes: SHEETS_SCOPE,
    });
  }

  if (keyFile) {
    return new google.auth.JWT({
      email,
      keyFile,
      scopes: SHEETS_SCOPE,
    });
  }

  throw new Error(
    "Set GOOGLE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS in .env before using Google Sheets.",
  );
}

module.exports = { createSheetsAuth };
