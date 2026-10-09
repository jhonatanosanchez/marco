/**
 * Public repository of the project, used for links in the UI (Google guide, kiosk installer command).
 * Forks: point it (and the READMEs, CONTRIBUTING.md and .github/) at your own repository.
 */
export const REPO_URL = 'https://github.com/mr-reb00t/marco';

/** One-line installer (install.sh from the repository, served by the project site). */
export const INSTALL_URL = 'https://marcohome.app/install';

/** Command that turns a Raspberry Pi (or any Debian/Ubuntu desktop) into a kiosk showing `url`. */
export const kioskInstallCommand = (url: string) => `curl -fsSL ${INSTALL_URL} | bash -s -- --mode kiosk --url ${url}`;
