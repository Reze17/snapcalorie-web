import { z } from "zod";

// Defense-in-depth on top of resolveExportRange's own lenient clamping
// (src/server/export/range.ts) — this just rejects a garbage/oversized
// query value outright before it reaches date parsing at all, per the
// Phase 10 security pass ("validate and sanitise all inputs with zod at
// every route boundary"). It does not change the UX of the lenient
// fallback for a merely-unparseable-but-reasonably-shaped date string.
export const exportDateParamSchema = z
  .string()
  .max(32)
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .nullish();
