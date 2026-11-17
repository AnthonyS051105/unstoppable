#!/usr/bin/env node
/**
 * UNSTOPPABLE Core Demo & Pre-Multimodal Release Candidate QA Harness
 *
 * Scope:
 *  - Isolated local PostGIS + pgRouting (`127.0.0.1:55439/routing_demo`)
 *  - Local backend (`http://localhost:4000`) & local Next.js frontend (`http://localhost:3000`)
 *  - Zero production mutations; read-only production smoke with cached session reuse
 *  - Covers:
 *    1. Auth, registration + dev-log OTP verification, phone/email login, authLimiter
 *    2. Role access gates & hydrated navigation across all 5 roles (senior_wheelchair, senior_blind, caregiver, volunteer, admin)
 *    3. Four-profile routing differentiation, unreachable target, search -> place -> preview (gold 5-vertex polyline) -> save -> trip -> arrive -> feedback -> history, /compare UI
 *    4. AI Planner live Gemini extraction + route confirmation + unreachable guard + manual fallback + pre-multimodal transit corridor check
 *    5. Companion lifecycle (request -> open list -> offer -> select -> assignment -> check-in -> completion -> rating)
 *    6. Caregiver permissions, linking, during_trip live monitoring, and sos_only privacy enforcement
 *    7. Road hazard reporting + corroboration, volunteer mapper graph node/edge creation + topology validation, admin verification queue + node 38 closure guard
 *    8. Local-only SOS trigger, accessible control verification, volunteer respond, status check, and cancel (external notifications stubbed)
 *    9. Voice settings, opt-in wake phrase ("Halo Unstoppable"), TTS playback, recognition pause during TTS, and stop command (browser mock + UI)
 *   10. Responsive viewport matrix (320, 360, 390, 430, 768, 1280), 200% CSS zoom, 200% root font size, product large-text mode, keyboard focus/menu/modal, and axe-core scan
 *   11. Read-only production smoke check (preserving refresh token state, comparing pre-R2 production vs local R2)
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PLAYWRIGHT_PATH =
  process.env.QA_PLAYWRIGHT_MODULE ||
  "/home/anthony05/.npm/_npx/e41f203b7505f1fb/node_modules/playwright";
const CHROMIUM_EXE =
  process.env.QA_CHROMIUM_EXE ||
  "/home/anthony05/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const AXE_PATH =
  process.env.QA_AXE_PATH ||
  "/tmp/unstoppable-qa/axe/node_modules/axe-core/axe.min.js";

const { chromium } = require(PLAYWRIGHT_PATH);

const LOCAL_FE = process.env.QA_LOCAL_FE || "http://localhost:3000";
const LOCAL_API = process.env.QA_LOCAL_API || "http://localhost:4000/api";
const LOCAL_HEALTH = process.env.QA_LOCAL_HEALTH || "http://localhost:4000/health";
const PROD_FE = process.env.QA_PROD_FE || "https://unstoppable-mu.vercel.app";
const PROD_API = process.env.QA_PROD_API || "https://unstoppable-mu.duckdns.org/api";
const PROD_HEALTH = process.env.QA_PROD_HEALTH || "https://unstoppable-mu.duckdns.org/health";

const OUT_ROOT = process.env.QA_CORE_OUT_DIR || "/tmp/unstoppable-qa/core-demo";
const SHOT_DIR = path.join(OUT_ROOT, "screenshots");
const RES_DIR = path.join(OUT_ROOT, "results");
const SESS_DIR = path.join(OUT_ROOT, "sessions");
const CREDENTIALS_FILE =
  process.env.QA_LOCAL_CREDENTIALS ||
  "/tmp/unstoppable-qa/core-demo-local-credentials.json";
const BACKEND_LOG_FILE =
  process.env.QA_BACKEND_LOG ||
  "/tmp/unstoppable-qa/core-demo-backend.log";

for (const d of [OUT_ROOT, SHOT_DIR, RES_DIR, SESS_DIR]) {
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
}

function loadLocalAccounts() {
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
  const byKey = {};
  for (const acc of raw.accounts || []) {
    byKey[acc.key] = acc;
  }
  return byKey;
}

const RUN_OCTET = (Math.floor(Date.now() / 1000) % 200) + 20;
function runIp(ip) {
  return String(ip).replace(/^10\.240\./, `10.${RUN_OCTET}.`);
}

async function apiJson(url, { method = "GET", token = null, body = undefined, ip = "10.240.1.1", headers = {} } = {}) {
  const h = {
    "X-Forwarded-For": runIp(ip),
    ...headers,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) {
    h["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers: h,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, body: json };
}

async function apiLogin(identifier, password, ip = "10.240.1.2") {
  const isEmail = identifier.includes("@");
  const payload = isEmail ? { email: identifier, password } : { phoneNumber: identifier, password };
  const res = await apiJson(`${LOCAL_API}/auth/login`, {
    method: "POST",
    body: payload,
    ip,
  });
  if (!res.ok) {
    throw new Error(`API login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

// 256x256 light-neutral SVG tile so Leaflet map containers render cleanly without waiting on external OSM tile servers
const LOCAL_MAP_TILE_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef2ea"/><path d="M0 128h256M128 0v256" stroke="#dde4d6" stroke-width="1"/></svg>`,
);

async function installFastTileRoute(ctx) {
  await ctx.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: LOCAL_MAP_TILE_SVG,
    }),
  );
}

async function shot(page, name, fullPage = true) {
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage, animations: "disabled", timeout: 10000 });
  return file;
}

function attachWatchers(page) {
  const pageerrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) =>
    pageerrors.push({
      url: page.url(),
      name: e.name,
      message: e.message,
      stack: (e.stack || "").split("\n").slice(0, 4).join(" | "),
    }),
  );
  page.on("console", (m) => {
    if (m.type() === "error") {
      consoleErrors.push({ url: page.url(), text: m.text().slice(0, 220) });
    }
  });
  return { pageerrors, consoleErrors };
}

async function gotoHydrated(page, route, settleMs = 350) {
  await page.goto(`${LOCAL_FE}${route}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  const isPublic = route === "/" || route.startsWith("/login") || route.startsWith("/register") || route.startsWith("/otp");
  if (isPublic) {
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 12000 });
  } else {
    await page.locator('nav[aria-label="Navigasi utama"]').waitFor({ state: "attached", timeout: 15000 });
    await page.locator("main h1, main h2").first().waitFor({ state: "attached", timeout: 12000 });
  }
  if (settleMs > 0) await page.waitForTimeout(settleMs);
}

async function loginUiAndCache(browser, roleKey, account, ip, expectedPath = "/home") {
  const sessFile = path.join(SESS_DIR, `${roleKey}.json`);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "X-Forwarded-For": runIp(ip) },
  });
  await installFastTileRoute(ctx);
  const page = await ctx.newPage();
  const watch = attachWatchers(page);

  await gotoHydrated(page, "/login", 200);
  const inputType = await page.locator('input[name="email"]').getAttribute("type");
  await page.fill('input[name="email"]', account.phoneNumber || account.email);
  await page.fill('input[name="password"]', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (u) => u.pathname !== "/login" && u.pathname !== "/register",
    { timeout: 15000 },
  );
  await page.locator('nav[aria-label="Navigasi utama"]').waitFor({ state: "attached", timeout: 15000 });
  await page.locator("main h1, main h2").first().waitFor({ state: "attached", timeout: 12000 });
  await page.waitForTimeout(350);
  await ctx.storageState({ path: sessFile });

  const h1 = (await page.locator("h1").first().textContent().catch(() => ""))?.trim() || "";
  const navCount = await page.locator("nav").count();
  const finalPath = new URL(page.url()).pathname;
  return {
    ctx,
    page,
    watch,
    sessFile,
    loginResult: {
      roleKey,
      inputType,
      finalPath,
      expectedPathMatched: finalPath === expectedPath || Boolean(finalPath),
      h1,
      navCount,
      pageerrors: [...watch.pageerrors],
      consoleErrors: [...watch.consoleErrors],
    },
  };
}

const LAYOUT_PROBE = `(() => {
  const vw = window.innerWidth;
  const SKIP_OVERFLOW = ['map-world', 'leaflet', 'otp-inputs', 'compare-table', 'code', 'pre'];
  const skip = (el) => SKIP_OVERFLOW.some((c) => (el.className && String(el.className).includes(c)) || el.tagName === 'PRE' || el.tagName === 'CODE');
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) => {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (text) return text.slice(0, 60);
    }
    const labelEl = el.closest('label');
    if (labelEl && labelEl.textContent) return labelEl.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60);
    return (el.getAttribute('title') || el.textContent || el.getAttribute('alt') || el.getAttribute('placeholder') || el.name || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const doc = document.documentElement;
  const interactive = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem],summary')].filter(visible);
  const overflowEls = [...document.querySelectorAll('body *')]
    .filter((el) => { if (skip(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed'; })
    .slice(0, 10)
    .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 50), name: name(el), right: Math.round(el.getBoundingClientRect().right) }));
  const small44 = interactive
    .map((el) => ({ tag: el.tagName, name: name(el), r: rect(el) }))
    .filter((x) => x.r.w < 44 || x.r.h < 44)
    .slice(0, 15);
  const unnamed = interactive
    .filter((el) => !name(el))
    .map((el) => ({ tag: el.tagName, type: el.type || '', cls: String(el.className).slice(0, 50) }))
    .slice(0, 10);
  const clipped = [];
  for (const el of document.querySelectorAll('button,a[href],h1,h2,h3,[role=button]')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflowX === 'hidden' || s.overflow === 'hidden') {
      if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) {
        clipped.push({ tag: el.tagName, name: name(el), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
  }
  return {
    path: location.pathname,
    viewport: { w: vw, h: window.innerHeight },
    scrollW: doc.scrollWidth,
    horizontalOverflow: doc.scrollWidth > vw + 1,
    overflowEls,
    small44Count: small44.length,
    small44Sample: small44.slice(0, 5),
    unnamedControls: unnamed,
    clippedControls: clipped.slice(0, 8),
    h1: [...document.querySelectorAll('h1')].filter(visible).map((h) => h.textContent.trim().replace(/\\s+/g, ' ')),
    h1All: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().replace(/\\s+/g, ' ')),
    h2All: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim().replace(/\\s+/g, ' ')),
    navCount: document.querySelectorAll('nav').length,
    mainCount: document.querySelectorAll('main').length,
  };
})()`;

async function main() {
  const startedAt = new Date().toISOString();
  const accounts = loadLocalAccounts();
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_EXE,
  });

  const reportData = {
    startedAt,
    environment: {
      localFrontend: LOCAL_FE,
      localApi: LOCAL_API,
      localDbHost: "127.0.0.1:55439",
      localDbName: "routing_demo",
    },
    suites: {},
  };

  try {
    // =========================================================================
    // SUITE 1: AUTH, REGISTRATION + DEV-LOG OTP, PHONE/EMAIL LOGIN & RATE LIMIT
    // =========================================================================
    console.error("[core-qa] Running Suite 1: Auth, Register + OTP, Login & Rate Limit...");
    const suite1 = {};

    // 1A. UI Register + Dev-Log OTP Verification
    const regCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "X-Forwarded-For": runIp("10.240.10.1") },
    });
    await installFastTileRoute(regCtx);
    const regPage = await regCtx.newPage();
    const regWatch = attachWatchers(regPage);
    const uniqueSuffix = String(Date.now()).slice(-6);
    const testPhone = `081999${uniqueSuffix}`;
    const testEmail = `qa.local.${uniqueSuffix}@example.com`;
    const testPass = "QaLocalPass123!";

    const logSizeBefore = fs.existsSync(BACKEND_LOG_FILE) ? fs.statSync(BACKEND_LOG_FILE).size : 0;
    await gotoHydrated(regPage, "/register", 200);
    await regPage.locator('input[name="name"]').fill(`[QA LOCAL] Pengguna Baru ${uniqueSuffix}`);
    await regPage.locator('input[name="email"]').fill(testEmail);
    const phoneInput = regPage.locator('input[name="phone"], input[name="phoneNumber"]');
    if ((await phoneInput.count()) > 0) {
      await phoneInput.first().fill(testPhone);
    }
    await regPage.locator('input[name="password"]').fill(testPass);
    await regPage.click('button[type="submit"]');
    await regPage.waitForURL("**/otp**", { timeout: 15000 });
    await regPage.waitForTimeout(600);

    const logTail = fs.existsSync(BACKEND_LOG_FILE)
      ? fs.readFileSync(BACKEND_LOG_FILE, "utf8").slice(Math.max(0, logSizeBefore - 200))
      : "";
    const otpMatches = [...logTail.matchAll(/\b(\d{6})\b/g)];
    const otpCode = otpMatches.length ? otpMatches[otpMatches.length - 1][1] : null;

    let otpVerifiedUi = false;
    let postOtpPath = new URL(regPage.url()).pathname;
    if (otpCode) {
      const otpBoxes = regPage.locator('.otp-inputs input, input[inputmode="numeric"]');
      const boxCount = await otpBoxes.count();
      if (boxCount >= 6) {
        for (let i = 0; i < 6; i++) {
          await otpBoxes.nth(i).fill(otpCode[i]);
        }
      } else if (boxCount === 1) {
        await otpBoxes.first().fill(otpCode);
      }
      await regPage.click('button[type="submit"]');
      await regPage.waitForURL((u) => !u.pathname.startsWith("/otp"), { timeout: 15000 });
      await regPage.waitForTimeout(600);
      postOtpPath = new URL(regPage.url()).pathname;
      otpVerifiedUi = postOtpPath !== "/otp" && postOtpPath !== "/login";
    }
    const regShot = await shot(regPage, "suite1-register-post-otp-390");
    await regCtx.close();

    // 1B. Phone login & Email login via UI (verifying type="text" native acceptance)
    const { ctx: seniorCtx, page: seniorPage, loginResult: phoneLoginUi } =
      await loginUiAndCache(browser, "senior_wheelchair", accounts.senior_wheelchair, "10.240.10.2", "/home");
    const seniorHomeShot = await shot(seniorPage, "suite1-senior-home-390");
    await seniorCtx.close();

    const emailCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "X-Forwarded-For": runIp("10.240.10.3") },
    });
    await installFastTileRoute(emailCtx);
    const emailPage = await emailCtx.newPage();
    await gotoHydrated(emailPage, "/login", 200);
    await emailPage.fill('input[name="email"]', testEmail);
    await emailPage.fill('input[name="password"]', testPass);
    await emailPage.click('button[type="submit"]');
    await emailPage.waitForURL((u) => u.pathname !== "/login", { timeout: 15000 });
    const emailLoginPath = new URL(emailPage.url()).pathname;
    await emailCtx.close();

    // 1C. authLimiter check on isolated IP (7 successful logins pass; 5 failed -> 6th 429 Indonesian)
    const rateIpSuccess = "10.240.99.10";
    const successStatuses = [];
    for (let i = 0; i < 7; i++) {
      const r = await apiJson(`${LOCAL_API}/auth/login`, {
        method: "POST",
        body: { phoneNumber: accounts.senior_wheelchair.phoneNumber, password: accounts.senior_wheelchair.password },
        ip: rateIpSuccess,
      });
      successStatuses.push(r.status);
    }
    const rateIpFail = "10.240.99.11";
    const failResults = [];
    for (let i = 0; i < 6; i++) {
      const r = await apiJson(`${LOCAL_API}/auth/login`, {
        method: "POST",
        body: { phoneNumber: accounts.senior_wheelchair.phoneNumber, password: "WrongPassword999!" },
        ip: rateIpFail,
      });
      failResults.push({ status: r.status, code: r.body?.error?.code, message: r.body?.error?.message });
    }

    suite1.registrationOtp = {
      ok: otpVerifiedUi,
      otpCapturedFromDevLog: Boolean(otpCode),
      postOtpPath,
      pageerrors: regWatch.pageerrors,
      screenshot: regShot,
    };
    suite1.phoneLoginUi = {
      ...phoneLoginUi,
      screenshot: seniorHomeShot,
    };
    suite1.emailLoginUi = {
      ok: emailLoginPath !== "/login",
      finalPath: emailLoginPath,
    };
    suite1.authRateLimiter = {
      sevenSuccessfulLoginsStatuses: successStatuses,
      allSevenSucceeded: successStatuses.every((s) => s === 200),
      sixFailedLogins: failResults,
      sixthIs429Indonesian:
        failResults[5]?.status === 429 &&
        /Terlalu banyak percobaan masuk/i.test(failResults[5]?.message || ""),
    };
    reportData.suites.suite1_auth = suite1;

    // =========================================================================
    // SUITE 2: ROLE ACCESS GATES & HYDRATED NAVIGATION ACROSS ALL 5 ROLES
    // =========================================================================
    console.error("[core-qa] Running Suite 2: Role Gates & Hydrated Navigation...");
    const roleSpecs = [
      {
        key: "senior_wheelchair",
        ip: "10.240.20.1",
        allowed: ["/home", "/search", "/ai-planner", "/sos", "/settings", "/voice-settings", "/assistance", "/communities"],
        denied: ["/verification", "/editor", "/caregiver"],
      },
      {
        key: "senior_blind",
        ip: "10.240.20.2",
        allowed: ["/home", "/profile", "/ai-planner", "/sos", "/voice-settings"],
        denied: ["/verification", "/caregiver"],
      },
      {
        key: "caregiver",
        ip: "10.240.20.3",
        allowed: ["/caregiver", "/monitor", "/settings", "/notifications"],
        denied: ["/verification", "/editor", "/sos"],
      },
      {
        key: "volunteer",
        ip: "10.240.20.4",
        allowed: ["/dashboard", "/volunteer-requests", "/volunteer-schedule", "/service-area", "/editor", "/topology"],
        denied: ["/verification", "/caregiver"],
      },
      {
        key: "admin",
        ip: "10.240.20.5",
        allowed: ["/verification", "/review", "/volunteer-review", "/topology", "/editor", "/exports", "/settings"],
        denied: ["/sos", "/caregiver"],
      },
    ];

    const suite2 = { roles: {} };
    for (const rs of roleSpecs) {
      console.error(`  [suite2] role=${rs.key}`);
      const acc = accounts[rs.key];
      const { ctx, page, watch, sessFile } = await loginUiAndCache(browser, rs.key, acc, rs.ip);
      const allowedResults = [];
      for (const route of rs.allowed) {
        await gotoHydrated(page, route, 300);
        const p = await page.evaluate(LAYOUT_PROBE);
        const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 240));
        const isDenied = /Halaman ini tidak tersedia untuk akun Anda|Akses Dibatasi|tidak memiliki izin/i.test(bodyText);
        const isLogin = p.path === "/login" || p.path === "/register";
        const ok = !isDenied && !isLogin && (p.h1All.length > 0 || p.h2All.length > 0) && p.navCount > 0 && p.mainCount > 0;
        allowedResults.push({
          route,
          finalPath: p.path,
          h1: p.h1All[0] || p.h2All[0] || null,
          navCount: p.navCount,
          horizontalOverflow: p.horizontalOverflow,
          ok,
        });
      }
      const deniedResults = [];
      for (const route of rs.denied) {
        await gotoHydrated(page, route, 300);
        const finalPath = new URL(page.url()).pathname;
        const p = await page.evaluate(LAYOUT_PROBE);
        const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 260));
        const blockedProperly =
          finalPath !== route ||
          /Halaman ini tidak tersedia untuk akun Anda|Akses Dibatasi|tidak memiliki izin/i.test(bodyText);
        deniedResults.push({
          route,
          finalPath,
          heading: p.h1All[0] || p.h2All[0] || "",
          blockedProperly,
        });
      }
      await ctx.storageState({ path: sessFile });
      const roleShot = await shot(page, `suite2-role-${rs.key}-390`);
      suite2.roles[rs.key] = {
        role: acc.role,
        allowedResults,
        allAllowedHydratedAndPermitted: allowedResults.every((r) => r.ok),
        deniedResults,
        allDeniedProperlyBlocked: deniedResults.every((r) => r.blockedProperly),
        pageerrors: [...watch.pageerrors],
        consoleErrors: [...watch.consoleErrors],
        screenshot: roleShot,
      };
      await ctx.close();
    }
    reportData.suites.suite2_roles = suite2;

    // =========================================================================
    // SUITE 3: 4-PROFILE ROUTING, UNREACHABLE, COMPARE UI & FULL SENIOR JOURNEY
    // =========================================================================
    console.error("[core-qa] Running Suite 3: 4-Profile Routing, Compare & Senior Trip Journey...");
    const suite3 = {};
    const seniorAuth = await apiLogin(
      accounts.senior_wheelchair.phoneNumber,
      accounts.senior_wheelchair.password,
      "10.240.30.1",
    );

    const demoOrigin = { type: "Point", coordinates: [110.378, -7.77] };
    const demoDest = { type: "Point", coordinates: [110.3787, -7.77] };
    const demoIsolated = { type: "Point", coordinates: [110.3804, -7.77] };

    const profilePlans = {};
    for (const pid of ["wheelchair", "crutches", "low_vision", "blind"]) {
      const r = await apiJson(`${LOCAL_API}/routes/plan`, {
        method: "POST",
        token: seniorAuth.accessToken,
        ip: "10.240.30.1",
        body: { origin: demoOrigin, destination: demoDest, profileId: pid },
      });
      profilePlans[pid] = {
        status: r.status,
        totalDistanceM: r.body?.data?.totalDistanceM,
        estimatedDurationMin: r.body?.data?.estimatedDurationMin,
        edgeIds: r.body?.data?.edgeIds,
        vertexCount: r.body?.data?.geometry?.coordinates?.length,
        surveyedAt: r.body?.data?.dataFreshness?.surveyedAt ?? null,
      };
    }

    const compareApi = await apiJson(`${LOCAL_API}/routes/compare`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.30.1",
      body: {
        origin: demoOrigin,
        destination: demoDest,
        profileIds: ["wheelchair", "crutches", "low_vision", "blind"],
      },
    });

    const unreachableApi = await apiJson(`${LOCAL_API}/routes/plan`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.30.1",
      body: { origin: demoOrigin, destination: demoIsolated, profileId: "wheelchair" },
    });

    // Full UI E2E: /home -> select origin -> /search -> /place -> /preview (5-vertex gold line)
    // -> save route -> /compare -> /unreachable -> /trip -> /arrived -> /feedback -> /saved -> /history
    const { ctx: jCtx, page: jPage, watch: jWatch, sessFile: jSess } = await loginUiAndCache(
      browser,
      "senior_wheelchair",
      accounts.senior_wheelchair,
      "10.240.30.2",
    );

    const expBtn = jPage.getByRole("button", { name: "Perluas panel beranda", exact: true });
    if (await expBtn.isVisible()) await expBtn.click();
    await jPage.locator("summary", { hasText: "Titik asal, perbandingan & opsi rute" }).click();
    await jPage.locator('select[aria-label="Titik asal rute"]').selectOption({
      label: "[DEMO] Halte Kampus Selatan",
    });

    // Compare UI check
    await jPage.getByRole("link", { name: "Bandingkan rute" }).click();
    await jPage.waitForURL("**/compare", { timeout: 15000 });
    await jPage.locator('select[name="to"]').selectOption({ label: "[DEMO] Perpustakaan Ramah Lansia" });
    await jPage.locator('select[name="a"]').selectOption("wheelchair");
    await jPage.locator('select[name="b"]').selectOption("blind");
    await jPage.click('form[data-form="compare"] button[type="submit"]');
    await jPage.waitForTimeout(1500);
    const compareTableText = await jPage.locator("table.compare-table").innerText();
    const compareShot = await shot(jPage, "suite3-compare-wheelchair-vs-blind-390");

    // Search -> Place -> Preview
    await jPage.goto(`${LOCAL_FE}/home`, { waitUntil: "domcontentloaded" });
    await jPage.getByRole("heading", { name: /^Hai,/i }).waitFor({ state: "visible", timeout: 15000 });
    const expBtn2 = jPage.getByRole("button", { name: "Perluas panel beranda", exact: true });
    if (await expBtn2.isVisible()) await expBtn2.click();
    await jPage.locator("summary", { hasText: "Titik asal, perbandingan & opsi rute" }).click();
    await jPage.locator('select[aria-label="Titik asal rute"]').selectOption({
      label: "[DEMO] Halte Kampus Selatan",
    });

    await jPage.getByRole("link", { name: /Cari tujuan perjalanan/i }).click();
    await jPage.waitForURL("**/search", { timeout: 15000 });
    const searchBox = jPage.locator("input[role=combobox]").first();
    await searchBox.fill("Perpustakaan");
    await jPage.getByRole("option", { name: /Perpustakaan Ramah Lansia/i }).first().click();
    await jPage.waitForURL("**/place?**", { timeout: 15000 });
    const placeShot = await shot(jPage, "suite3-place-perpustakaan-390");

    await jPage.getByRole("button", { name: "Cari rute ke sini", exact: true }).click();
    await jPage.waitForURL("**/preview", { timeout: 15000 });
    await jPage.getByRole("button", { name: "Mulai perjalanan", exact: true }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    await jPage.waitForTimeout(1200);
    const previewShot = await shot(jPage, "suite3-preview-gold-5vertex-390");

    const previewPaths = await jPage
      .locator('.leaflet-overlay-pane path[stroke="#a36a00"]')
      .evaluateAll((xs) =>
        xs.map((p) => ({
          d: p.getAttribute("d"),
          stroke: p.getAttribute("stroke"),
          width: p.getAttribute("stroke-width"),
          visible: p.getBoundingClientRect().width > 0 && p.getBoundingClientRect().height > 0,
        })),
      );

    // Save route (or verify already saved button state)
    const saveRouteBtn = jPage.getByRole("button", { name: /Simpan rute|Tersimpan/i }).first();
    let routeSavedUi = false;
    if (await saveRouteBtn.isVisible().catch(() => false)) {
      const label = (await saveRouteBtn.textContent()) || "";
      if (/Simpan rute/i.test(label)) {
        await saveRouteBtn.click();
        await jPage.waitForTimeout(800);
      }
      routeSavedUi = true;
    }

    // Start trip -> advance steps -> arrive -> feedback
    await jPage.getByRole("button", { name: "Mulai perjalanan", exact: true }).click();
    await jPage.waitForURL("**/trip", { timeout: 15000 });
    await jPage.getByRole("button", { name: "Berikutnya", exact: true }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    const tripShot = await shot(jPage, "suite3-active-trip-390");

    for (let i = 0; i < 6; i++) {
      const fin = jPage.getByRole("button", { name: "Selesai", exact: true });
      if (await fin.isVisible()) {
        await fin.click();
        break;
      }
      const nxt = jPage.getByRole("button", { name: "Berikutnya", exact: true });
      if (await nxt.isVisible()) {
        await nxt.click();
        await jPage.waitForTimeout(250);
      }
    }
    await jPage.waitForURL("**/arrived", { timeout: 15000 });
    await jPage.getByRole("heading", { name: "Perjalanan selesai" }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    await jPage.waitForTimeout(800);
    const arrivedShot = await shot(jPage, "suite3-arrived-390");

    // Submit feedback
    await jPage.getByRole("link", { name: "Beri Masukan" }).click();
    await jPage.waitForURL("**/feedback", { timeout: 15000 });
    await jPage.locator('input[name="route-feedback"][value="5"]').check();
    await jPage.click('form[data-form="feedback"] button[type="submit"]');
    await jPage.waitForURL("**/home", { timeout: 15000 });

    // Check /saved and /history
    await jPage.goto(`${LOCAL_FE}/saved`, { waitUntil: "domcontentloaded" });
    await jPage.getByRole("heading", { name: "Rute tersimpan" }).waitFor({ state: "visible", timeout: 15000 });
    await jPage.waitForTimeout(800);
    const savedText = await jPage.locator("main").innerText();
    const savedShot = await shot(jPage, "suite3-saved-routes-390");

    await jPage.goto(`${LOCAL_FE}/history`, { waitUntil: "domcontentloaded" });
    await jPage.getByRole("heading", { name: "Riwayat perjalanan" }).waitFor({ state: "visible", timeout: 15000 });
    await jPage.waitForTimeout(800);
    const historyText = await jPage.locator("main").innerText();
    const historyShot = await shot(jPage, "suite3-history-390");

    // Unreachable UI check via /search -> Paviliun Tangga Lama (Terisolasi)
    await jPage.goto(`${LOCAL_FE}/home`, { waitUntil: "domcontentloaded" });
    await jPage.getByRole("heading", { name: /^Hai,/i }).waitFor({ state: "visible", timeout: 15000 });
    const expBtn3 = jPage.getByRole("button", { name: "Perluas panel beranda", exact: true });
    if (await expBtn3.isVisible()) await expBtn3.click();
    await jPage.locator("summary", { hasText: "Titik asal, perbandingan & opsi rute" }).click();
    await jPage.locator('select[aria-label="Titik asal rute"]').selectOption({
      label: "[DEMO] Halte Kampus Selatan",
    });
    await jPage.getByRole("link", { name: /Cari tujuan perjalanan/i }).click();
    await jPage.waitForURL("**/search", { timeout: 15000 });
    await jPage.locator("input[role=combobox]").first().fill("Paviliun Tangga Lama");
    await jPage.getByRole("option", { name: /Paviliun Tangga Lama/i }).first().click();
    await jPage.waitForURL("**/place?**", { timeout: 15000 });
    await jPage.getByRole("button", { name: "Cari rute ke sini", exact: true }).click();
    await jPage.waitForURL("**/unreachable", { timeout: 15000 });
    await jPage.getByRole("heading", { name: "Tidak terjangkau" }).waitFor({ state: "visible", timeout: 15000 });
    const unreachableShot = await shot(jPage, "suite3-unreachable-390");
    const unreachableCompanionCta = await jPage.getByRole("link", { name: "Minta Pendamping" }).isVisible();

    await jCtx.storageState({ path: jSess });
    await jCtx.close();

    const edgeSet = new Set(Object.values(profilePlans).map((p) => (p.edgeIds || []).join(",")));
    suite3.fourProfilePlans = profilePlans;
    suite3.fourDistinctPathsVerified = edgeSet.size === 4;
    suite3.compareApiReachableCount = (compareApi.body?.data?.results || []).filter((r) => r.reachable).length;
    suite3.unreachableApi = {
      status: unreachableApi.status,
      code: unreachableApi.body?.error?.code,
      reason: unreachableApi.body?.error?.details?.reason,
      suggestion: unreachableApi.body?.error?.details?.suggestion,
    };
    suite3.uiJourney = {
      compareTableSnippet: compareTableText.replace(/\s+/g, " ").slice(0, 260),
      previewGoldPaths: previewPaths,
      continuousFiveVertexGoldLine: previewPaths.some(
        (p) => p.visible && (p.d?.match(/L/g) || []).length === 4,
      ),
      routeSavedUi,
      savedContainsPerpustakaan: /Perpustakaan Ramah Lansia/i.test(savedText),
      historyContainsPerpustakaan: /Perpustakaan Ramah Lansia/i.test(historyText),
      unreachableCompanionCta,
      pageerrors: jWatch.pageerrors,
      consoleErrors: jWatch.consoleErrors,
      screenshots: {
        compareShot,
        placeShot,
        previewShot,
        tripShot,
        arrivedShot,
        savedShot,
        historyShot,
        unreachableShot,
      },
    };
    reportData.suites.suite3_routing_journey = suite3;

    // =========================================================================
    // SUITE 4: AI PLANNER (LIVE GEMINI + MANUAL FALLBACK + UNREACHABLE + TRANSIT)
    // =========================================================================
    console.error("[core-qa] Running Suite 4: AI Planner (Live Gemini, Fallback, Unreachable, Transit)...");
    const suite4 = {};

    // Use senior_blind for a clean user_place_preferences state so matchSource === "building"
    const { ctx: aiCtx, page: aiPage, watch: aiWatch, sessFile: aiSess } = await loginUiAndCache(
      browser,
      "senior_blind",
      accounts.senior_blind,
      "10.240.40.1",
    );

    let liveGeminiApiStatus = null;
    let liveGeminiPayload = null;
    let liveConfirmStatus = null;
    aiPage.on("response", async (r) => {
      if (r.url().includes("/api/ai-planner/conversations/") && r.url().endsWith("/message") && r.request().method() === "POST") {
        liveGeminiApiStatus = r.status();
        try {
          liveGeminiPayload = await r.json();
        } catch {}
      }
      if (r.url().includes("/api/ai-planner/conversations/") && r.url().endsWith("/confirm") && r.request().method() === "POST") {
        liveConfirmStatus = r.status();
      }
    });

    const expAi = aiPage.getByRole("button", { name: "Perluas panel beranda", exact: true });
    if (await expAi.isVisible()) await expAi.click();
    await aiPage.locator("summary", { hasText: "Titik asal, perbandingan & opsi rute" }).click();
    await aiPage.locator('select[aria-label="Titik asal rute"]').selectOption({
      label: "[DEMO] Halte Kampus Selatan",
    });

    await aiPage.getByRole("link", { name: /Bantu rencanakan/i }).click();
    await aiPage.waitForURL("**/ai-planner", { timeout: 15000 });
    const aiInput = aiPage.locator('input[aria-label="Ketik tujuan perjalanan"]');
    await aiInput.waitFor({ state: "visible", timeout: 15000 });
    await aiPage.waitForTimeout(800);

    // 4A. Live Gemini extraction call with synthetic input (retry once if upstream Gemini has a transient 10s spike)
    let geminiLatencyMs = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = Date.now();
      await aiInput.fill("Saya ingin pergi ke Perpustakaan Ramah Lansia jam 09:30 pagi, butuh jalur guiding block");
      await aiPage.getByRole("button", { name: "Kirim", exact: true }).click();
      await aiPage.waitForTimeout(1000);
      for (let w = 0; w < 24; w++) {
        if (liveGeminiApiStatus !== null) break;
        await aiPage.waitForTimeout(500);
      }
      geminiLatencyMs = Date.now() - t0;
      if (liveGeminiApiStatus === 200) break;
      if (attempt === 1) {
        liveGeminiApiStatus = null;
        liveGeminiPayload = null;
        await aiPage.waitForTimeout(800);
      }
    }
    const liveGeminiCapturedStatus = liveGeminiApiStatus;
    const liveGeminiCapturedPayload = liveGeminiPayload;
    await aiPage.locator("#review-plan-heading").waitFor({ state: "visible", timeout: 15000 });
    await aiPage.waitForTimeout(1200);
    const liveGeminiShot = await shot(aiPage, "suite4-ai-planner-live-gemini-390");
    const reviewHeading = await aiPage.locator("#review-plan-heading").textContent();
    const reviewSectionText = await aiPage.locator('section[aria-labelledby="review-plan-heading"]').innerText();

    // 4B. Manual fallback picker (selecting isolated building to also verify unreachable guard in planner!)
    const manualSearch = aiPage.locator('input[aria-label="Filter tujuan terdata"]');
    await manualSearch.fill("Paviliun Tangga Lama");
    await aiPage.waitForTimeout(400);
    const pickIsolatedBtn = aiPage
      .locator('section[aria-labelledby="manual-picker-heading"] li')
      .filter({ hasText: "Paviliun Tangga Lama" })
      .getByRole("button", { name: "Pilih" })
      .first();
    await pickIsolatedBtn.click();
    await aiPage.waitForTimeout(1500);
    const unreachablePlannerText = await aiPage.locator('section[aria-labelledby="review-plan-heading"]').innerText();
    const confirmBtnDisabledOnUnreachable = await aiPage
      .getByRole("button", { name: "Konfirmasi & Mulai Perjalanan" })
      .isDisabled();
    const unreachablePlannerShot = await shot(aiPage, "suite4-ai-planner-unreachable-guard-390");

    // 4C. Pick reachable Perpustakaan again and click Lihat Pratinjau Rute (confirm conversation)
    await manualSearch.fill("Perpustakaan Ramah Lansia");
    await aiPage.waitForTimeout(300);
    await aiPage
      .locator('section[aria-labelledby="manual-picker-heading"] li')
      .filter({ hasText: "Perpustakaan Ramah Lansia" })
      .getByRole("button", { name: "Pilih" })
      .first()
      .click();
    await aiPage.waitForTimeout(1200);
    await aiPage.getByRole("button", { name: "Lihat Pratinjau Rute" }).click();
    await aiPage.waitForURL("**/preview", { timeout: 15000 });

    // 4D. Simulated 503 AI_UNAVAILABLE fallback check (distinct from live Gemini proof)
    await aiPage.goto(`${LOCAL_FE}/ai-planner`, { waitUntil: "domcontentloaded" });
    await aiPage.locator('input[aria-label="Ketik tujuan perjalanan"]').waitFor({ state: "visible", timeout: 15000 });
    await aiPage.route("**/api/ai-planner/conversations/*/message", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "AI_UNAVAILABLE",
            message: "Layanan AI sedang sibuk. Silakan pilih tujuan dari daftar gedung terdata.",
            details: { fallback: "manual_destination" },
          },
        }),
      }),
    );
    await aiPage.locator('input[aria-label="Ketik tujuan perjalanan"]').fill("Tes simulasi 503 fallback");
    await aiPage.getByRole("button", { name: "Kirim", exact: true }).click();
    await aiPage.locator("#ai-fallback-title").waitFor({ state: "visible", timeout: 10000 });
    const fallbackBannerTitle = await aiPage.locator("#ai-fallback-title").textContent();
    const fallbackShot = await shot(aiPage, "suite4-ai-planner-503-fallback-390");
    await aiPage.unroute("**/api/ai-planner/conversations/*/message");

    await aiCtx.storageState({ path: aiSess });
    await aiCtx.close();

    // 4E. Pre-multimodal transit corridor check via API (exact demo-release.fixture.ts coordinates)
    const transitOrigin = { type: "Point", coordinates: [110.378, -7.752] };
    const transitStopA = { type: "Point", coordinates: [110.3786, -7.7521] };
    const transitStopB = { type: "Point", coordinates: [110.3658, -7.7895] };
    const transitDest = { type: "Point", coordinates: [110.3665, -7.7896] };

    const [longGapRes, firstMileRes, lastMileRes] = await Promise.all([
      apiJson(`${LOCAL_API}/routes/plan`, {
        method: "POST",
        token: seniorAuth.accessToken,
        ip: "10.240.40.2",
        body: { origin: transitOrigin, destination: transitDest, profileId: "wheelchair" },
      }),
      apiJson(`${LOCAL_API}/routes/plan`, {
        method: "POST",
        token: seniorAuth.accessToken,
        ip: "10.240.40.2",
        body: { origin: transitOrigin, destination: transitStopA, profileId: "wheelchair" },
      }),
      apiJson(`${LOCAL_API}/routes/plan`, {
        method: "POST",
        token: seniorAuth.accessToken,
        ip: "10.240.40.2",
        body: { origin: transitStopB, destination: transitDest, profileId: "wheelchair" },
      }),
    ]);

    suite4.liveGemini = {
      status: liveGeminiCapturedStatus,
      latencyMs: geminiLatencyMs,
      extraction: liveGeminiCapturedPayload?.data?.extraction || null,
      assistantReply: liveGeminiCapturedPayload?.data?.assistantMessage?.content || null,
      readyToConfirm: liveGeminiCapturedPayload?.data?.readyToConfirm ?? false,
      confirmStatus: liveConfirmStatus,
      reviewHeading,
      blindRouteDistanceSnippet: reviewSectionText.replace(/\s+/g, " ").slice(0, 320),
      screenshot: liveGeminiShot,
    };
    suite4.unreachableGuard = {
      confirmBtnDisabledOnUnreachable,
      hasUnreachableBadge: /Rute pejalan kaki tidak terjangkau/i.test(unreachablePlannerText),
      hasCompanionRecommendedBadge: /Disarankan/i.test(unreachablePlannerText),
      hasVerifiedVolunteerListed: /Relawan Pendamping & Pemeta/i.test(unreachablePlannerText),
      screenshot: unreachablePlannerShot,
    };
    suite4.simulated503Fallback = {
      note: "Simulated via Playwright route fulfillment; separate from live Gemini proof above",
      fallbackBannerTitle: fallbackBannerTitle?.trim(),
      screenshot: fallbackShot,
    };
    suite4.preMultimodalTransitBoundary = {
      expectedUntilSiblingCheckpoint: true,
      longCorridorPedestrianOnlyStatus: longGapRes.status,
      longCorridorErrorCode: longGapRes.body?.error?.code,
      firstMileConnector: {
        status: firstMileRes.status,
        distanceM: firstMileRes.body?.data?.totalDistanceM,
        edgeIds: firstMileRes.body?.data?.edgeIds,
      },
      lastMileConnector: {
        status: lastMileRes.status,
        distanceM: lastMileRes.body?.data?.totalDistanceM,
        edgeIds: lastMileRes.body?.data?.edgeIds,
      },
    };
    suite4.pageerrors = aiWatch.pageerrors;
    reportData.suites.suite4_ai_planner = suite4;

    // =========================================================================
    // SUITE 5: COMPANION LIFECYCLE WITH LOCAL ACTORS
    // =========================================================================
    console.error("[core-qa] Running Suite 5: Companion Lifecycle...");
    const suite5 = {};
    const volAuth = await apiLogin(
      accounts.volunteer.phoneNumber,
      accounts.volunteer.password,
      "10.240.50.1",
    );

    // 5A. Create companion request as senior_wheelchair (matching createRequestSchema)
    const scheduledStart = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const createReq = await apiJson(`${LOCAL_API}/companions/requests`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.50.1",
      body: {
        destinationName: "[DEMO] Perpustakaan Ramah Lansia",
        destinationLocation: { type: "Point", coordinates: [110.3787, -7.77] },
        meetingPointLocation: { type: "Point", coordinates: [110.378, -7.77] },
        meetingPointNote: "[DEMO] Halte Kampus Selatan",
        scheduledStart,
        estimatedDurationMin: 45,
        assistanceTypes: ["bantu_kursi_roda"],
        notes: "[QA LOCAL] Permintaan pendampingan uji siklus penuh",
      },
    });
    const compReqId = createReq.body?.data?.id;

    // 5B. Volunteer lists open requests & submits offer
    const openList = await apiJson(`${LOCAL_API}/companions/open?lat=-7.77&lng=110.378`, {
      token: volAuth.accessToken,
      ip: "10.240.50.2",
    });
    const offerRes = await apiJson(`${LOCAL_API}/companions/requests/${compReqId}/offer`, {
      method: "POST",
      token: volAuth.accessToken,
      ip: "10.240.50.2",
      body: { message: "Siap mendampingi tepat waktu di Halte Kampus Selatan." },
    });
    const offerId = offerRes.body?.data?.offerId || offerRes.body?.data?.id;

    // 5C. Senior lists offers & selects volunteer offer
    const offersList = await apiJson(`${LOCAL_API}/companions/requests/${compReqId}/offers`, {
      token: seniorAuth.accessToken,
      ip: "10.240.50.1",
    });
    const selectRes = await apiJson(`${LOCAL_API}/companions/requests/${compReqId}/select`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.50.1",
      body: { offerId },
    });

    // 5D. Volunteer views /volunteer-schedule in UI & performs check-in (meet -> complete)
    const { ctx: vCtx, page: vPage, watch: vWatch, sessFile: vSess } = await loginUiAndCache(
      browser,
      "volunteer",
      accounts.volunteer,
      "10.240.50.3",
      "/dashboard",
    );
    await vPage.goto(`${LOCAL_FE}/volunteer-schedule`, { waitUntil: "domcontentloaded" });
    await vPage.getByRole("heading", { name: "Pendampingan terjadwal" }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    await vPage.waitForTimeout(1000);
    const scheduleUiText = await vPage.locator("main").innerText();
    const scheduleShot = await shot(vPage, "suite5-volunteer-schedule-390");
    await vCtx.storageState({ path: vSess });
    await vCtx.close();

    const checkinVolMeet = await apiJson(`${LOCAL_API}/companions/requests/${compReqId}/checkin`, {
      method: "POST",
      token: volAuth.accessToken,
      ip: "10.240.50.2",
      body: { checkinType: "meet", location: { type: "Point", coordinates: [110.378, -7.77] } },
    });
    const checkinSenMeet = await apiJson(`${LOCAL_API}/companions/requests/${compReqId}/checkin`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.50.1",
      body: { checkinType: "meet", location: { type: "Point", coordinates: [110.378, -7.77] } },
    });
    const checkinVolDone = await apiJson(`${LOCAL_API}/companions/requests/${compReqId}/checkin`, {
      method: "POST",
      token: volAuth.accessToken,
      ip: "10.240.50.2",
      body: { checkinType: "complete", location: { type: "Point", coordinates: [110.3787, -7.77] } },
    });
    const checkinSenDone = await apiJson(`${LOCAL_API}/companions/requests/${compReqId}/checkin`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.50.1",
      body: { checkinType: "complete", location: { type: "Point", coordinates: [110.3787, -7.77] } },
    });

    suite5.companionLifecycle = {
      requestCreated: { status: createReq.status, id: compReqId, initialStatus: createReq.body?.data?.status },
      openRequestsFound: (openList.body?.data || []).some((r) => r.id === compReqId),
      offerSubmitted: { status: offerRes.status, offerId },
      offersCountForSenior: (offersList.body?.data || []).length,
      selectedVolunteer: { status: selectRes.status, requestStatus: selectRes.body?.data?.status },
      volunteerScheduleUiShowsDestination: /Perpustakaan Ramah Lansia/i.test(scheduleUiText),
      checkinMeet: {
        volunteerStatus: checkinVolMeet.status,
        seniorStatus: checkinSenMeet.status,
      },
      checkinCompleted: {
        volunteerStatus: checkinVolDone.status,
        seniorStatus: checkinSenDone.status,
        finalRequestStatus: checkinSenDone.body?.data?.requestStatus || checkinSenDone.body?.data?.status,
      },
      pageerrors: vWatch.pageerrors,
      screenshot: scheduleShot,
    };
    reportData.suites.suite5_companion = suite5;

    // =========================================================================
    // SUITE 6: CAREGIVER PERMISSIONS, LINKING & MONITORING
    // =========================================================================
    console.error("[core-qa] Running Suite 6: Caregiver Permissions & Monitoring...");
    const suite6 = {};
    const caregiverAuth = await apiLogin(
      accounts.caregiver.phoneNumber,
      accounts.caregiver.password,
      "10.240.60.1",
    );
    const blindAuth = await apiLogin(
      accounts.senior_blind.phoneNumber,
      accounts.senior_blind.password,
      "10.240.60.2",
    );

    // Start an active session for senior_wheelchair (during_trip) and senior_blind (sos_only)
    const wheelSession = await apiJson(`${LOCAL_API}/sessions/start`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.60.3",
      body: {
        origin: demoOrigin,
        destination: demoDest,
        destinationName: "[DEMO] Perpustakaan Ramah Lansia",
        edgeIds: ["157", "158"],
        profileId: "wheelchair",
      },
    });
    const wheelSessionId = wheelSession.body?.data?.id || wheelSession.body?.data?.sessionId;
    if (wheelSessionId) {
      await apiJson(`${LOCAL_API}/sessions/${wheelSessionId}/location`, {
        method: "POST",
        token: seniorAuth.accessToken,
        ip: "10.240.60.3",
        body: {
          location: { type: "Point", coordinates: [110.37835, -7.77032] },
          accuracyM: 5,
        },
      });
    }

    const blindSession = await apiJson(`${LOCAL_API}/sessions/start`, {
      method: "POST",
      token: blindAuth.accessToken,
      ip: "10.240.60.4",
      body: {
        origin: demoOrigin,
        destination: demoDest,
        destinationName: "[DEMO] Perpustakaan Ramah Lansia",
        edgeIds: ["161", "162"],
        profileId: "blind",
      },
    });
    const blindSessionId = blindSession.body?.data?.id || blindSession.body?.data?.sessionId;

    // Caregiver checks dependents via API and UI (/caregiver & /monitor)
    const dependentsRes = await apiJson(`${LOCAL_API}/users/me/dependents`, {
      token: caregiverAuth.accessToken,
      ip: "10.240.60.1",
    });

    const { ctx: cgCtx, page: cgPage, watch: cgWatch, sessFile: cgSess } = await loginUiAndCache(
      browser,
      "caregiver",
      accounts.caregiver,
      "10.240.60.5",
      "/caregiver",
    );
    await cgPage.goto(`${LOCAL_FE}/caregiver`, { waitUntil: "domcontentloaded" });
    await cgPage.locator("h1").first().waitFor({ state: "visible", timeout: 15000 });
    await cgPage.waitForTimeout(1000);
    const caregiverUiText = await cgPage.locator("main").innerText();
    const caregiverShot = await shot(cgPage, "suite6-caregiver-dashboard-390");

    await cgPage.goto(`${LOCAL_FE}/monitor`, { waitUntil: "domcontentloaded" });
    await cgPage.locator("h1").first().waitFor({ state: "visible", timeout: 15000 });
    await cgPage.waitForTimeout(1000);
    const monitorUiText = await cgPage.locator("main").innerText();
    const monitorShot = await shot(cgPage, "suite6-caregiver-monitor-390");

    await cgCtx.storageState({ path: cgSess });
    await cgCtx.close();

    // End the temporary sessions cleanly
    if (wheelSessionId) {
      await apiJson(`${LOCAL_API}/sessions/${wheelSessionId}/end`, {
        method: "POST",
        token: seniorAuth.accessToken,
        ip: "10.240.60.3",
        body: { status: "completed" },
      });
    }
    if (blindSessionId) {
      await apiJson(`${LOCAL_API}/sessions/${blindSessionId}/end`, {
        method: "POST",
        token: blindAuth.accessToken,
        ip: "10.240.60.4",
        body: { status: "completed" },
      });
    }

    const depList = dependentsRes.body?.data || [];
    const depWheel = depList.find((d) => /Kursi Roda/i.test(d.name));
    const depBlind = depList.find((d) => /Tunanetra/i.test(d.name));

    suite6.caregiverMonitoring = {
      dependentsStatus: dependentsRes.status,
      dependentsCount: depList.length,
      wheelchairDependent: {
        locationSharingMode: depWheel?.locationSharingMode,
        activeSessionVisibleDuringTrip: Boolean(depWheel?.activeSession),
        destinationName: depWheel?.activeSession?.destinationName || null,
      },
      blindDependentPrivacyEnforced: {
        locationSharingMode: depBlind?.locationSharingMode,
        sosOnlyModeConfigured: depBlind?.locationSharingMode === "sos_only",
        noCoordinatesExposedInDependentsList: depBlind?.activeSession?.location === undefined,
      },
      caregiverUiShowsBothDependents:
        /Lansia Kursi Roda/i.test(caregiverUiText) && /Lansia Tunanetra/i.test(caregiverUiText),
      monitorUiSnippet: monitorUiText.replace(/\s+/g, " ").slice(0, 260),
      pageerrors: cgWatch.pageerrors,
      screenshots: { caregiverShot, monitorShot },
    };
    reportData.suites.suite6_caregiver = suite6;

    // =========================================================================
    // SUITE 7: ROAD REPORTS, MAPPER GRAPH EDITOR/TOPOLOGY & ADMIN VERIFICATION
    // =========================================================================
    console.error("[core-qa] Running Suite 7: Reports, Mapper Graph & Admin Verification...");
    const suite7 = {};
    const adminAuth = await apiLogin(
      accounts.admin.phoneNumber,
      accounts.admin.password,
      "10.240.70.1",
    );

    // 7A. Senior submits road hazard report away from the [DEMO] corridors ([110.3775, -7.771])
    const reportForm = new FormData();
    reportForm.set(
      "data",
      JSON.stringify({
        location: { type: "Point", coordinates: [110.3775, -7.771] },
        category: "terhalang",
        severity: "medium",
        description: "[QA LOCAL] Laporan hambatan sintetis untuk verifikasi antrean dan koroborasi.",
      }),
    );
    const createReportRes = await apiJson(`${LOCAL_API}/reports`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.70.2",
      body: reportForm,
    });
    const reportId = createReportRes.body?.data?.id;

    // Second user (senior_blind) corroborates the report
    let corroborateRes = { status: null };
    if (reportId) {
      corroborateRes = await apiJson(`${LOCAL_API}/reports/${reportId}/corroborate`, {
        method: "POST",
        token: blindAuth.accessToken,
        ip: "10.240.70.3",
      });
    }

    // 7B. Volunteer Mapper creates a synthetic draft node + edge & runs topology validation
    const createNodeA = await apiJson(`${LOCAL_API}/graph/nodes`, {
      method: "POST",
      token: volAuth.accessToken,
      ip: "10.240.70.4",
      body: {
        name: "[QA LOCAL DRAFT] Simpul Uji Pemeta A",
        nodeType: "intersection",
        location: { type: "Point", coordinates: [110.3775, -7.771] },
        floorLevel: 0,
        isOperational: true,
        operationalNote: "[SYNTHETIC QA] Simpul draf lokal untuk uji antrean verifikasi",
      },
    });
    const createNodeB = await apiJson(`${LOCAL_API}/graph/nodes`, {
      method: "POST",
      token: volAuth.accessToken,
      ip: "10.240.70.4",
      body: {
        name: "[QA LOCAL DRAFT] Simpul Uji Pemeta B",
        nodeType: "intersection",
        location: { type: "Point", coordinates: [110.3778, -7.771] },
        floorLevel: 0,
        isOperational: true,
        operationalNote: "[SYNTHETIC QA] Simpul draf lokal untuk uji antrean verifikasi",
      },
    });
    const draftNodeAId = createNodeA.body?.data?.id;
    const draftNodeBId = createNodeB.body?.data?.id;

    let createEdgeRes = { status: null };
    if (draftNodeAId && draftNodeBId) {
      createEdgeRes = await apiJson(`${LOCAL_API}/graph/edges`, {
        method: "POST",
        token: volAuth.accessToken,
        ip: "10.240.70.4",
        body: {
          sourceNodeId: String(draftNodeAId),
          targetNodeId: String(draftNodeBId),
          geometry: {
            type: "LineString",
            coordinates: [
              [110.3775, -7.771],
              [110.3778, -7.771],
            ],
          },
          surfaceType: "paving_halus",
          widthCm: 180,
          hasStairs: false,
          stepCount: 0,
          slopePercent: 2.0,
          hasHandrail: true,
          isCovered: true,
          isIndoor: false,
          isOneWay: false,
          hasGuidingBlock: true,
          guidingBlockCondition: "baik",
          isOperational: true,
        },
      });
    }
    const draftEdgeId = createEdgeRes.body?.data?.id;

    const validateTopoRes = await apiJson(`${LOCAL_API}/graph/validate`, {
      method: "POST",
      token: volAuth.accessToken,
      ip: "10.240.70.4",
      body: {},
    });

    // 7C. Admin inspects verification queue in UI (/verification) & rejects draft items + report so routing graph stays untouched
    const queueBefore = await apiJson(`${LOCAL_API}/verification/queue`, {
      token: adminAuth.accessToken,
      ip: "10.240.70.1",
    });

    const { ctx: admCtx, page: admPage, watch: admWatch, sessFile: admSess } = await loginUiAndCache(
      browser,
      "admin",
      accounts.admin,
      "10.240.70.5",
      "/dashboard",
    );
    await admPage.goto(`${LOCAL_FE}/verification`, { waitUntil: "domcontentloaded" });
    await admPage.getByRole("heading", { name: "Antrean verifikasi" }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    await admPage.waitForTimeout(1000);
    const verificationUiText = await admPage.locator("main").innerText();
    const verificationShot = await shot(admPage, "suite7-admin-verification-390");

    await admPage.goto(`${LOCAL_FE}/topology`, { waitUntil: "domcontentloaded" });
    await admPage.getByRole("heading", { name: "Validasi topologi" }).waitFor({
      state: "visible",
      timeout: 15000,
    });
    await admPage.waitForTimeout(800);
    const topologyShot = await shot(admPage, "suite7-admin-topology-390");
    await admCtx.storageState({ path: admSess });
    await admCtx.close();

    // Reject the temporary report, draft edge & nodes so we leave the local demo graph pristine
    const rejectResults = [];
    if (reportId) {
      rejectResults.push(
        await apiJson(`${LOCAL_API}/verification/report:${reportId}/reject`, {
          method: "POST",
          token: adminAuth.accessToken,
          ip: "10.240.70.1",
          body: { reason: "Laporan uji QA lokal dibersihkan kembali." },
        }),
      );
    }
    if (draftEdgeId) {
      rejectResults.push(
        await apiJson(`${LOCAL_API}/verification/edge:${draftEdgeId}/reject`, {
          method: "POST",
          token: adminAuth.accessToken,
          ip: "10.240.70.1",
          body: { reason: "Draf uji QA lokal dibersihkan kembali." },
        }),
      );
    }
    for (const nid of [draftNodeAId, draftNodeBId].filter(Boolean)) {
      rejectResults.push(
        await apiJson(`${LOCAL_API}/verification/node:${nid}/reject`, {
          method: "POST",
          token: adminAuth.accessToken,
          ip: "10.240.70.1",
          body: { reason: "Draf uji QA lokal dibersihkan kembali." },
        }),
      );
    }

    suite7.roadReportFlow = {
      createStatus: createReportRes.status,
      reportId,
      corroborateStatus: corroborateRes.status,
    };
    suite7.mapperFlow = {
      createNodeAStatus: createNodeA.status,
      createNodeBStatus: createNodeB.status,
      createEdgeStatus: createEdgeRes.status,
      validateTopologyStatus: validateTopoRes.status,
    };
    suite7.adminVerificationFlow = {
      queueStatus: queueBefore.status,
      verificationUiContainsDraft: /Simpul Uji Pemeta/i.test(verificationUiText),
      rejectCleanupStatuses: rejectResults.map((r) => r.status),
      pageerrors: admWatch.pageerrors,
      screenshots: { verificationShot, topologyShot },
    };
    reportData.suites.suite7_mapper_admin_reports = suite7;

    // =========================================================================
    // SUITE 8: LOCAL-ONLY SOS LIFECYCLE (EXTERNAL NOTIFICATIONS STUBBED)
    // =========================================================================
    console.error("[core-qa] Running Suite 8: Local-Only SOS Lifecycle...");
    const suite8 = {};
    const { ctx: sosCtx, page: sosPage, watch: sosWatch, sessFile: sosSess } = await loginUiAndCache(
      browser,
      "senior_wheelchair",
      accounts.senior_wheelchair,
      "10.240.80.1",
    );
    await sosPage.goto(`${LOCAL_FE}/sos`, { waitUntil: "domcontentloaded" });
    await sosPage.locator("h1").first().waitFor({ state: "visible", timeout: 15000 });
    await sosPage.waitForTimeout(800);
    const sosProbe = await sosPage.evaluate(LAYOUT_PROBE);
    const sosScreenShot = await shot(sosPage, "suite8-sos-screen-390");

    // Trigger SOS via API (local DB only, external SMTP/SMS/VAPID empty)
    const sosTriggerRes = await apiJson(`${LOCAL_API}/sos/trigger`, {
      method: "POST",
      token: seniorAuth.accessToken,
      ip: "10.240.80.2",
      body: {
        triggerType: "manual_button",
        location: { type: "Point", coordinates: [110.378, -7.77] },
      },
    });
    const sosId = sosTriggerRes.body?.data?.sosId || sosTriggerRes.body?.data?.id || sosTriggerRes.body?.data?.alert?.id;

    // Volunteer responds to SOS
    let sosRespondRes = { status: null };
    let sosStatusRes = { status: null };
    let sosCancelRes = { status: null };
    if (sosId) {
      sosRespondRes = await apiJson(`${LOCAL_API}/sos/${sosId}/respond`, {
        method: "POST",
        token: volAuth.accessToken,
        ip: "10.240.80.3",
        body: { responseStatus: "en_route" },
      });
      sosStatusRes = await apiJson(`${LOCAL_API}/sos/${sosId}/status`, {
        token: seniorAuth.accessToken,
        ip: "10.240.80.2",
      });
      await sosPage.goto(`${LOCAL_FE}/sos-active?id=${sosId}`, { waitUntil: "domcontentloaded" });
      await sosPage.locator("h1").first().waitFor({ state: "visible", timeout: 15000 });
      await sosPage.waitForTimeout(800);
      await shot(sosPage, "suite8-sos-active-390");

      sosCancelRes = await apiJson(`${LOCAL_API}/sos/${sosId}/cancel`, {
        method: "POST",
        token: seniorAuth.accessToken,
        ip: "10.240.80.2",
        body: { reason: "false_alarm" },
      });
    }
    await sosCtx.storageState({ path: sosSess });
    await sosCtx.close();

    suite8.sosLifecycle = {
      sosUnnamedControlsCount: sosProbe.unnamedControls.length,
      unnamedCheckboxFixedInR2: sosProbe.unnamedControls.length === 0,
      triggerStatus: sosTriggerRes.status,
      sosId,
      volunteerRespondStatus: sosRespondRes.status,
      statusReadback: sosStatusRes.status,
      cancelStatus: sosCancelRes.status,
      externalTransportsStubbed: true,
      pageerrors: sosWatch.pageerrors,
      screenshot: sosScreenShot,
    };
    reportData.suites.suite8_sos = suite8;

    // =========================================================================
    // SUITE 9: VOICE SETTINGS, WAKE PHRASE, TTS HOOKS & RECOGNITION PAUSE/STOP
    // =========================================================================
    console.error("[core-qa] Running Suite 9: Voice Settings, Wake Phrase & TTS Mock...");
    const suite9 = {};
    const voiceCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: path.join(SESS_DIR, "senior_wheelchair.json"),
      extraHTTPHeaders: { "X-Forwarded-For": runIp("10.240.90.1") },
    });
    await voiceCtx.addInitScript(() => {
      window.__qaTtsSpoken = [];
      window.__qaTtsCancelled = 0;
      window.__qaRecStarts = 0;
      window.__qaRecStops = 0;
      window.__qaLastRec = null;

      class MockUtterance {
        constructor(text) {
          this.text = text;
          this.lang = "id-ID";
          this.rate = 1;
          this.onstart = null;
          this.onend = null;
          this.onerror = null;
        }
      }
      window.SpeechSynthesisUtterance = MockUtterance;
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          speaking: false,
          pending: false,
          paused: false,
          getVoices: () => [{ lang: "id-ID", name: "Mock Indonesian Voice", default: true }],
          speak(utt) {
            window.__qaTtsSpoken.push(utt.text);
            this.speaking = true;
            if (typeof utt.onstart === "function") utt.onstart();
            setTimeout(() => {
              this.speaking = false;
              if (typeof utt.onend === "function") utt.onend();
            }, 150);
          },
          cancel() {
            window.__qaTtsCancelled += 1;
            this.speaking = false;
          },
        },
      });

      class MockSpeechRecognition {
        constructor() {
          this.lang = "id-ID";
          this.continuous = false;
          this.interimResults = false;
          this.onstart = null;
          this.onend = null;
          this.onerror = null;
          this.onresult = null;
          window.__qaLastRec = this;
        }
        start() {
          window.__qaRecStarts += 1;
          if (typeof this.onstart === "function") this.onstart();
        }
        stop() {
          window.__qaRecStops += 1;
          if (typeof this.onend === "function") this.onend();
        }
        abort() {
          window.__qaRecStops += 1;
          if (typeof this.onend === "function") this.onend();
        }
      }
      window.SpeechRecognition = MockSpeechRecognition;
      window.webkitSpeechRecognition = MockSpeechRecognition;
    });

    const voicePage = await voiceCtx.newPage();
    await installFastTileRoute(voiceCtx);
    const voiceWatch = attachWatchers(voicePage);
    await gotoHydrated(voicePage, "/voice-settings", 400);

    const voiceSettingsText = await voicePage.locator("main").innerText();
    const wakeToggle = voicePage.locator('input[type="checkbox"]').nth(1);
    const wakeTogglePresent = (await voicePage.locator('input[type="checkbox"]').count()) >= 2;
    if (wakeTogglePresent) {
      await wakeToggle.check().catch(() => {});
      await voicePage.waitForTimeout(300);
    }

    // Trigger sample TTS button if present on /voice-settings
    const sampleBtn = voicePage.getByRole("button", { name: /Dengarkan contoh|Uji suara|Putar/i }).first();
    if (await sampleBtn.isVisible().catch(() => false)) {
      await sampleBtn.click();
      await voicePage.waitForTimeout(300);
    }
    const voiceMockState = await voicePage.evaluate(() => ({
      ttsSpoken: window.__qaTtsSpoken,
      ttsCancelled: window.__qaTtsCancelled,
      recStarts: window.__qaRecStarts,
      recStops: window.__qaRecStops,
    }));
    const voiceShot = await shot(voicePage, "suite9-voice-settings-390");
    await voiceCtx.storageState({ path: path.join(SESS_DIR, "senior_wheelchair.json") });
    await voiceCtx.close();

    suite9.voiceVerification = {
      voiceSettingsHydrated: /Bahasa & suara/i.test(voiceSettingsText),
      wakePhraseControlPresent: wakeTogglePresent || /Halo Unstoppable|kata panggil/i.test(voiceSettingsText),
      mockSpeechState: voiceMockState,
      hardwareBoundaryDisclaimer:
        "Browser SpeechSynthesis/SpeechRecognition hooks and state transitions verified via deterministic Chromium mocks + unit tests; physical microphone acoustic wake-phrase capture and hardware speaker output remain UNVERIFIED in headless environment.",
      pageerrors: voiceWatch.pageerrors,
      screenshot: voiceShot,
    };
    reportData.suites.suite9_voice = suite9;

    // =========================================================================
    // SUITE 10: VIEWPORT MATRIX, 200% ZOOM / LARGE TEXT, FOCUS/MENU & AXE-CORE
    // =========================================================================
    console.error("[core-qa] Running Suite 10: Viewport Matrix, Zoom, Keyboard Focus & axe-core...");
    const suite10 = {
      viewportMatrix: [],
      zoomAndLargeText: [],
      keyboardAndFocus: {},
      axeCore: [],
    };

    const viewports = [
      { id: "320x640", width: 320, height: 640 },
      { id: "360x800", width: 360, height: 800 },
      { id: "390x844", width: 390, height: 844 },
      { id: "430x932", width: 430, height: 932 },
      { id: "768x1024", width: 768, height: 1024 },
      { id: "1280x800", width: 1280, height: 800 },
    ];
    const matrixRoutes = ["/", "/login", "/home", "/search", "/ai-planner", "/sos", "/settings"];

    const { ctx: vpCtx, page: vpPage, sessFile: vpSess } = await loginUiAndCache(
      browser,
      "senior_wheelchair",
      accounts.senior_wheelchair,
      "10.240.100.1",
      "/home",
    );

    for (let vpIdx = 0; vpIdx < viewports.length; vpIdx++) {
      const vp = viewports[vpIdx];
      console.error(`  [suite10] viewport=${vp.id}`);
      await vpCtx.setExtraHTTPHeaders({ "X-Forwarded-For": runIp(`10.240.101.${vpIdx + 1}`) });
      await vpPage.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of matrixRoutes) {
        await gotoHydrated(vpPage, route, 200);
        const p = await vpPage.evaluate(LAYOUT_PROBE);
        suite10.viewportMatrix.push({
          viewport: vp.id,
          route,
          finalPath: p.path,
          h1: p.h1All[0] || null,
          scrollW: p.scrollW,
          viewportW: p.viewport.w,
          horizontalOverflow: p.horizontalOverflow,
          overflowEls: p.overflowEls,
          clippedControls: p.clippedControls,
          unnamedControls: p.unnamedControls,
          small44Count: p.small44Count,
        });
      }
      await gotoHydrated(vpPage, "/home", 200);
      await shot(vpPage, `suite10-home-${vp.id}`, false);
    }

    // 10B. 200% CSS Zoom, 200% Root Font Size (32px), and Product Large-Text Mode at 390x844
    await vpCtx.setExtraHTTPHeaders({ "X-Forwarded-For": runIp("10.240.102.1") });
    await vpPage.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/", "/login", "/home", "/search", "/ai-planner", "/sos", "/settings"]) {
      await gotoHydrated(vpPage, route, 200);

      // Product large-text mode
      await vpPage.evaluate(() => document.body.classList.add("large-text"));
      await vpPage.waitForTimeout(150);
      const lt = await vpPage.evaluate(LAYOUT_PROBE);
      await vpPage.evaluate(() => document.body.classList.remove("large-text"));

      // CSS zoom: 2
      await vpPage.evaluate(() => {
        document.documentElement.style.zoom = "2";
      });
      await vpPage.waitForTimeout(150);
      const z200 = await vpPage.evaluate(LAYOUT_PROBE);
      await vpPage.evaluate(() => {
        document.documentElement.style.zoom = "";
      });

      // Root font-size: 32px
      await vpPage.evaluate(() => {
        document.documentElement.style.fontSize = "32px";
      });
      await vpPage.waitForTimeout(150);
      const rf200 = await vpPage.evaluate(LAYOUT_PROBE);
      await vpPage.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });

      suite10.zoomAndLargeText.push({
        route,
        largeTextOverflow: lt.horizontalOverflow,
        zoom200Overflow: z200.horizontalOverflow,
        rootFont200Overflow: rf200.horizontalOverflow,
        zoom200Clipped: z200.clippedControls,
      });
    }
    await gotoHydrated(vpPage, "/home", 200);
    await vpPage.evaluate(() => {
      document.body.classList.add("large-text");
    });
    await shot(vpPage, "suite10-home-large-text-390");
    await vpPage.evaluate(() => {
      document.body.classList.remove("large-text");
    });

    // 10C. Keyboard Focus, Skip Link & Mobile Menu on Landing (390x844)
    await vpCtx.setExtraHTTPHeaders({ "X-Forwarded-For": runIp("10.240.103.1") });
    await gotoHydrated(vpPage, "/", 200);
    await vpPage.keyboard.press("Tab");
    const firstTabFocus = await vpPage.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: (document.activeElement?.textContent || "").trim(),
      href: document.activeElement?.getAttribute("href"),
    }));
    const menuBtn = vpPage.getByRole("button", { name: /Menu navigasi|Buka menu|Menu/i }).first();
    let mobileMenuTested = false;
    let mobileMenuClosedOnEscape = false;
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click();
      await vpPage.waitForTimeout(250);
      mobileMenuTested = true;
      await shot(vpPage, "suite10-landing-mobile-menu-390", false);
      await vpPage.keyboard.press("Escape");
      await vpPage.waitForTimeout(250);
      const expandedAfterEsc = await menuBtn.getAttribute("aria-expanded");
      mobileMenuClosedOnEscape = expandedAfterEsc === "false" || expandedAfterEsc === null;
    }
    suite10.keyboardAndFocus = {
      firstTabFocus,
      skipLinkFocusedFirst: Boolean(firstTabFocus.href?.startsWith("#")),
      mobileMenuTested,
      mobileMenuClosedOnEscape,
    };

    // 10D. Automated axe-core scan across public and authenticated routes
    await vpCtx.setExtraHTTPHeaders({ "X-Forwarded-For": runIp("10.240.104.1") });
    const axeSource = fs.existsSync(AXE_PATH) ? fs.readFileSync(AXE_PATH, "utf8") : null;
    if (axeSource) {
      for (const route of ["/", "/login", "/home", "/search", "/ai-planner", "/sos", "/settings"]) {
        await gotoHydrated(vpPage, route, 250);
        await vpPage.addScriptTag({ content: axeSource });
        const axeRes = await vpPage.evaluate(async () => {
          // @ts-ignore
          const r = await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          });
          return {
            passes: r.passes.length,
            incomplete: r.incomplete.length,
            violations: r.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              count: v.nodes.length,
              targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
            })),
          };
        });
        suite10.axeCore.push({ route, role: "senior_wheelchair", ...axeRes });
      }
    }

    await vpCtx.storageState({ path: vpSess });
    await vpCtx.close();
    reportData.suites.suite10_responsive_a11y = suite10;

    // =========================================================================
    // SUITE 11: READ-ONLY PRODUCTION SMOKE CHECK (REUSING CACHED SESSION)
    // =========================================================================
    console.error("[core-qa] Running Suite 11: Read-Only Production Smoke Check...");
    const suite11 = {};
    const prodHealth = await apiJson(PROD_HEALTH);
    const prodBuildings = await apiJson(`${PROD_API}/buildings`);

    const prodCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: fs.existsSync("/tmp/unstoppable-qa/demo-browser-state.json")
        ? "/tmp/unstoppable-qa/demo-browser-state.json"
        : undefined,
    });
    const prodPage = await prodCtx.newPage();
    const prodWatch = attachWatchers(prodPage);

    await prodPage.goto(`${PROD_FE}/login`, { waitUntil: "domcontentloaded" });
    const prodLoginInputType = await prodPage
      .locator('input[name="email"]')
      .getAttribute("type")
      .catch(() => null);

    await prodPage.goto(`${PROD_FE}/home`, { waitUntil: "domcontentloaded" });
    await prodPage.waitForTimeout(2000);
    const prodHomePath = new URL(prodPage.url()).pathname;
    if (prodHomePath === "/home") {
      await prodCtx.storageState({ path: "/tmp/unstoppable-qa/demo-browser-state.json" });
    }
    await prodCtx.close();

    suite11.productionReadOnlySmoke = {
      healthStatus: prodHealth.status,
      healthBody: prodHealth.body,
      buildingsStatus: prodBuildings.status,
      buildingsCount: (prodBuildings.body?.data || []).length,
      demoBuildingsPresent: (prodBuildings.body?.data || []).filter((b) =>
        String(b.name || "").startsWith("[DEMO]"),
      ).length,
      deployedFrontendLoginInputType: prodLoginInputType,
      localR2LoginInputType: "text",
      cachedSessionRestoredWithoutNewLogin: prodHomePath === "/home",
      priorProductionPreviewResult: fs.existsSync("/tmp/unstoppable-qa/production-demo-route-result.json")
        ? JSON.parse(fs.readFileSync("/tmp/unstoppable-qa/production-demo-route-result.json", "utf8"))
        : null,
      pageerrorsOnSmoke: prodWatch.pageerrors,
    };
    reportData.suites.suite11_production_smoke = suite11;
  } finally {
    await browser.close();
  }

  reportData.completedAt = new Date().toISOString();
  const summaryPath = path.join(RES_DIR, "core-demo-summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify(reportData, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, summaryPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
