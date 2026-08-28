// CJS shim for uuid under Jest e2e.
//
// uuid@14 is ESM-only. exceljs (CJS) does `require('uuid')`, and when the full
// AppModule graph loads under Jest ESM, the CJS->ESM require cycle trips
// Jest's makeRequireCycleError. This shim is CJS and implements the API the
// app + exceljs use (v4) via node:crypto, so no require(esm) ever happens.
const { randomUUID } = require("node:crypto");

module.exports = { v4: randomUUID };
