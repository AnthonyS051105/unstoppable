import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // *.smoke.test.ts adalah script manual (butuh DB nyata via tsx, dijalankan
    // lewat "npm run db:smoke"-style command), bukan unit test — dikecualikan
    // dari "npm test" supaya tidak gagal karena Prisma client belum di-generate.
    exclude: ["**/node_modules/**", "**/*.smoke.test.ts"],
  },
});
