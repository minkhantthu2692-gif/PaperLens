# Bundled OCR language data

PaperLens bundles English and Burmese LSTM language data so OCR works offline without an
account, API key, or download.

| File                  | Language | Source                                                                 | SHA-256 (gzip)                                                     |
| --------------------- | -------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `eng.traineddata.gz`  | English  | [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) `main` | `de9de3a3764224ccb8c6219621d0fa3631cd49c9b10d1bcce93890b58caf5fd4` |
| `mya.traineddata.gz`  | Burmese  | [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) `main` | `24ee1b723ccaf242111ac1b64b15d26d57cc4fc1f0ffd7b6d4aae8da28ed9b60` |

The upstream LSTM models are distributed under the Apache License 2.0; see `LICENSE.txt` in
this directory. Files were gzip-compressed with `gzip -9` because Tesseract.js requests
`.traineddata.gz` by default.

To update a model, download the uncompressed file from `tessdata_fast`, verify it against the
upstream repository, recompress it, update the checksums above, and test English and Burmese
OCR on representative scans.

Tesseract.js worker/core runtime files are copied from `node_modules` into `public/ocr/` by
`scripts/sync-ocr-assets.mjs` and are not committed.
