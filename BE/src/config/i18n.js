const i18next = require('i18next');
const middleware = require('i18next-http-middleware');
const path = require('path');
const vi = require('../locales/vi.json');
const en = require('../locales/en.json');

i18next.use(middleware.LanguageDetector).init({
  fallbackLng: 'vi',
  preload: ['vi', 'en'],
  resources: {
    vi: { translation: vi },
    en: { translation: en },
  },
  detection: {
    order: ['header', 'querystring', 'cookie'],
    lookupHeader: 'accept-language',
    caches: false,
  },
});

module.exports = { i18next, middleware };
