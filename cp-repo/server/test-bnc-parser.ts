/**
 * Test script for BNC 3-format parser
 * Run with: npx tsx server/test-bnc-parser.ts
 */
import * as fs from "fs";
import * as path from "path";
import { parseExtractoBuffer } from "./extractoParser";

interface TestCase {
  file: string;
  format: string;
  expectedCredits: number;
}

const testCases: TestCase[] = [
  { file: "/home/user/workspace/bnc-170326.xls", format: "A (PreviousDay)", expectedCredits: 138 },
  { file: "/home/user/workspace/bnc.xls", format: "B (Custom)", expectedCredits: 112 },
  { file: "/home/user/workspace/Rpt20260317103943.xls", format: "B (Custom)", expectedCredits: 536 },
  { file: "/home/user/workspace/Rpt20260317103957.xls", format: "C (Online)", expectedCredits: 35 },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const filename = path.basename(tc.file);
  const buffer = fs.readFileSync(tc.file);
  const items = parseExtractoBuffer(buffer, "0191", filename);

  const ok = items.length === tc.expectedCredits;
  const status = ok ? "PASS" : "FAIL";

  console.log(`[${status}] ${filename} (Format ${tc.format}): got ${items.length} credits, expected ${tc.expectedCredits}`);

  if (!ok) {
    failed++;
    continue;
  }

  // Validate output structure
  let structureOk = true;
  for (const item of items) {
    if (!item.fecha || !item.referencia || item.monto <= 0 || !item.descripcion) {
      console.log(`  FAIL: bad item structure: ${JSON.stringify(item)}`);
      structureOk = false;
      break;
    }
    // Check date format is YYYY-MM-DD (from parseDate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.fecha)) {
      console.log(`  FAIL: bad date format: ${item.fecha}`);
      structureOk = false;
      break;
    }
  }
  if (structureOk) {
    console.log(`  Structure OK — sample: fecha=${items[0].fecha}, ref=${items[0].referencia}, monto=${items[0].monto}, desc="${items[0].descripcion.substring(0, 40)}"`);
    passed++;
  } else {
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${testCases.length} tests`);
process.exit(failed > 0 ? 1 : 0);
