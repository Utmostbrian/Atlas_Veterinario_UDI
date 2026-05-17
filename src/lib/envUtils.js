// B-02: single source of truth for BOM-safe env var reading
// UTF-8 files saved on Windows sometimes get a U+FEFF BOM prepended to the first value.
export function cleanEnv(val) {
  return typeof val === 'string' ? val.replace(/^﻿/, '').trim() : ''
}
