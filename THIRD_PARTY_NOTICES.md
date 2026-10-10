# Third-party notices

Marco itself is released under the [MIT License](LICENSE). It depends on open-source packages that keep
their own licenses. Most are MIT, ISC, BSD or Apache-2.0; the ones below deserve a specific note.

## Shipped in the built web UI (`dist/`)

| Package | License | Notes |
|---|---|---|
| [heic-to](https://github.com/hoppergee/heic-to) | **LGPL-3.0** | Converts iPhone HEIC/HEIF photos to JPEG in the admin's browser. It bundles [libheif](https://github.com/strukturag/libheif) and [libde265](https://github.com/strukturag/libde265) (both LGPL-3.0) compiled to WebAssembly. It is used **unmodified** and built into a **separate, lazily loaded chunk** (`dist/assets/heic-to-*.js`) that is only downloaded when a HEIC photo is selected, so it can be replaced with any compatible version (update `package.json` and rebuild). Its source code is available from the links above. |
| [@fontsource-variable/inter](https://fontsource.org/fonts/inter), [@fontsource-variable/outfit](https://fontsource.org/fonts/outfit) | SIL Open Font License 1.1 | Inter and Outfit typefaces, self-hosted so displays render correctly without Internet access. |
| [Noto Color Emoji](https://github.com/googlefonts/noto-emoji) | SIL Open Font License 1.1 | A subset with the emoji the admin offers (`web/shared/fonts/marco-emoji.woff2`, built by `scripts/build-emoji-font.mjs`; license in `web/shared/fonts/OFL.txt`), so the admin and the screens show the same emoji without loading fonts from other sites. Self-hosted displays may also load the full font from Google Fonts as before, when the device has no emoji font installed. |
| [three.js](https://threejs.org/) | MIT | WebGL photo transitions and ambient effects. |
| [Preact](https://preactjs.com/) | MIT | Admin panel UI. |

## Server runtime dependencies

| Package | License |
|---|---|
| [express](https://expressjs.com/), [cookie-session](https://github.com/expressjs/cookie-session), [multer](https://github.com/expressjs/multer), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | MIT |
| [node-ical](https://github.com/jens-maus/node-ical) | Apache-2.0 |
| [rrule](https://github.com/jkbrzt/rrule) | BSD-3-Clause |
| [dotenv](https://github.com/motdotla/dotenv) | BSD-2-Clause |

## Build-time only (not shipped)

Vite, TypeScript (Apache-2.0), lightningcss (MPL-2.0, used unmodified by the build tool), caniuse-lite (CC-BY-4.0)
and their dependencies are only used to build the web UI and are not part of the running application.

## Services (not bundled)

Weather data by the source chosen in *Weather*: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0),
[MET Norway](https://api.met.no/) (CC BY 4.0 and NLOD) or [Pirate Weather](https://pirateweather.net/) (the user's own
key, under its terms). The display credits the source next to the weather and the admin links to it and its licence.
Stock photos by [Lorem Picsum](https://picsum.photos/) (photos from Unsplash under the Unsplash license).

To list every installed package with its license: `npx license-checker --summary`.
