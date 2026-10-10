// The CHANGELOG section of this build (vite.config.ts `define`). Its own module so the text is a separate chunk that
// only Marco Cloud's admin loads (components/Updates.tsx).
export const APP_NOTES: string = typeof __APP_NOTES__ === 'string' ? __APP_NOTES__ : '';
