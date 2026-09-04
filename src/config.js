const mainLang = "uk"; // "ru" or "uk"

const SUPPORTED_LANGS = ["ru", "uk"];

if (!SUPPORTED_LANGS.includes(mainLang)) {
  throw new Error(`Unsupported mainLang: ${mainLang}`);
}

module.exports = { mainLang, SUPPORTED_LANGS };
