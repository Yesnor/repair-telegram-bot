const { google } = require("googleapis");
const { Readable } = require("stream");

const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

let cachedDrive = null;

async function getDrive() {
  if (cachedDrive) return cachedDrive;
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n") || undefined,
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  await auth.authorize();
  cachedDrive = google.drive({ version: "v3", auth });
  return cachedDrive;
}

/**
 * Загружает файл в папку Google Drive и возвращает ссылку на просмотр.
 */
async function createRequestFolder(folderName) {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: DRIVE_FOLDER_ID ? [DRIVE_FOLDER_ID] : undefined,
    },
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });
  return res.data;
}

async function uploadFileToDrive(buffer, filename, mimeType, parentFolderId) {
  const drive = await getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: parentFolderId ? [parentFolderId] : undefined,
    },
    media: { mimeType, body: Readable.from(buffer) },
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });
  return res.data.webViewLink;
}

module.exports = { createRequestFolder, uploadFileToDrive };
