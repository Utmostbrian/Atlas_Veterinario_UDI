// B-02 / M-02: single source of truth for BOM-safe env var reading.
// UTF-8 files saved on Windows sometimes get a U+FEFF BOM prepended to the first value.
// Usamos el escape Unicode ﻿ para evitar irregular-whitespace warnings del linter.
const BOM = /^﻿/

export function cleanEnv(val) {
  return typeof val === 'string' ? val.replace(BOM, '').trim() : ''
}
