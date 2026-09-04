const { mainLang } = require("./config");
const locales = { ru: require("./locales/ru"), uk: require("./locales/uk") };

function t(key, values = {}) {
  const value = key.split(".").reduce((current, part) => current?.[part], locales[mainLang]);
  if (value === undefined) throw new Error(`Missing translation: ${mainLang}.${key}`);
  if (typeof value !== "string") return value;
  return value.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

module.exports = { t, mainLang };
