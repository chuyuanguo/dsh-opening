# Notices

## Opening film and poster

`media/opening-1080p30.mp4` and `media/poster.png` are the title sequence
*DSH / OPENING — INTENT, IN FORM*.

- Every frame and every sound is original, generated procedurally for this
  piece. No stock footage, samples, or library music was used.
- **Typeface:** Montserrat, licensed under the SIL Open Font License 1.1. The
  font files are not redistributed here — only rendered pixels are. The license
  text is included at [`third-party/Montserrat-OFL.txt`](third-party/Montserrat-OFL.txt).
- **DeepSeek whale mark:** the official mark appears in the film as a small
  brand signature. The mark remains the property of DeepSeek and is used here
  only to identify the DeepSeek Harness product.
- The film and poster are © 2026 chuyuanguo. They are provided for use with
  this plugin and are not covered by the MIT license that applies to the
  source code.

## Third-party software

The plugin bundles no third-party JavaScript. React and the Harness runtime
are supplied by DeepSeek Harness itself at runtime; this repository does not
redistribute them.

## Credentials and data

The plugin contains no API keys, tokens, credentials, analytics, or telemetry.
It talks only to its own Host routes, all on the Harness origin:

- `GET /dsh-opening/state.json`
- `GET /dsh-opening/media/opening.mp4` (Range requests)
- `GET /dsh-opening/media/poster.png`
