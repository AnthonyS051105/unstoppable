import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // *.smoke.test.ts & *.smoke.ts adalah script manual (butuh DB nyata via tsx,
    // dijalankan lewat "npm run db:smoke"-style command), bukan unit test —
    // dikecualikan dari "npm test". Pola *.js/dist juga dikecualikan supaya
    // artefak kompilasi tsc (bila ada) tidak ikut terpindai sebagai suite.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.smoke.test.ts",
      "**/*.smoke.ts",
      "**/*.smoke.test.js",
      "**/*.js",
    ],
  },
});
