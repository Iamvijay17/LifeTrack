import base from './playwright.config.js'
export default { ...base, use: { ...base.use, baseURL: 'http://localhost:4174' }, webServer: undefined }
