# Third-party notices

This project's own source is covered by [LICENSE](LICENSE). It also bundles one
third-party library, which keeps its own license:

## jsQR

- File: `js/vendor/jsqr.js`
- Project: https://github.com/cozmo/jsQR
- Copyright (c) 2017 Cosmo Wolfe
- License: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)

Used only as a QR-decoder fallback for browsers that do not support the native
`BarcodeDetector` API (for example Safari on iOS). Everything else, including the
QR *encoder* used on the receive screen, is original to this project.
