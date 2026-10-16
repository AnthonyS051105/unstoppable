import type { Role } from "./data";
import type { DemoState } from "./demo-state";

type Cap = "verified" | "companion" | "mapdata";
type Rule = { roles: string[]; cap?: Cap | Partial<Record<Role, Cap>> };

export const ACCESS: Record<string, Rule> = (() => {
  const a: Record<string, Rule> = {};
  const set = (roles: string[], routes: string[], cap?: Rule["cap"]) => routes.forEach((r) => (a[r] = { roles, cap }));
  set(
    ["user"],
    [
      "search",
      "volunteers",
      "home",
      "loading",
      "preview",
      "unreachable",
      "profile",
      "trip",
      "arrived",
      "feedback",
      "report",
      "report-confirm",
      "report-sent",
      "my-reports",
      "assistance",
      "assistance-form",
      "assistance-status",
      "volunteer-offers",
      "assistance-detail",
      "assistance-rating",
      "sos",
      "sos-empty",
      "place",
      "communities",
      "community",
      "saved",
      "history",
    ],
  );
  set(["user", "volunteer", "caregiver"], ["sos-active"], { volunteer: "verified" });
  set(["user", "caregiver", "volunteer", "admin"], ["compare"]);
  set(["caregiver"], ["caregiver", "monitor"]);
  set(["user", "caregiver"], ["caregiver-link"]);
  set(["volunteer"], ["dashboard", "volunteer-register", "volunteer-pending"]);
  set(["volunteer"], ["service-area"], "verified");
  set(["volunteer"], ["volunteer-requests", "volunteer-request", "volunteer-schedule"], "companion");
  set(["volunteer", "admin"], ["editor", "topology"], { volunteer: "mapdata" });
  set(["admin"], ["review", "verification", "volunteer-review"]);
  set(["user", "volunteer", "admin"], ["exports"]);
  return a;
})();

type RoleState = Pick<DemoState, "role" | "verified" | "canCompanion" | "canMapData">;

export const isSeniorRole = (s: Pick<DemoState, "role">) => s.role === "blind_user" || s.role === "mobility_user";
export const accessRole = (s: Pick<DemoState, "role">) => (isSeniorRole(s) ? "user" : s.role);

function capOk(s: RoleState, c?: Cap) {
  if (!c || s.role === "admin") return true;
  return !!s.verified && (c === "verified" || (c === "companion" && s.canCompanion) || (c === "mapdata" && s.canMapData));
}

export type Denial = { why: "role"; roles: string[] } | { why: "cap"; cap: Cap };

export function denial(s: RoleState, route: string): Denial | null {
  const a = ACCESS[route];
  if (!a) return null;
  if (!a.roles.includes(accessRole(s))) return { why: "role", roles: a.roles };
  const c = typeof a.cap === "object" ? a.cap[s.role] : a.cap;
  return capOk(s, c) ? null : { why: "cap", cap: c! };
}

export function roleHome(s: Pick<DemoState, "role">) {
  return (
    (
      {
        blind_user: "home",
        mobility_user: "home",
        caregiver: "caregiver",
        volunteer: "dashboard",
        admin: "verification",
      } as Record<string, string>
    )[s.role] || "home"
  );
}

const SETTINGS_GROUP = [
  "settings",
  "account",
  "privacy",
  "voice-settings",
  "notifications",
  "notification-settings",
  "saved",
  "history",
  "help",
  "caregiver-link",
  "exports",
];

export type NavItem = [string, string, string, string, string[]];

export function navItems(s: RoleState): NavItem[] {
  const r = accessRole(s);
  const S: NavItem = ["settings", "Pengaturan", "Profil", "circle-user", SETTINGS_GROUP];
  if (r === "caregiver")
    return [
      ["caregiver", "Keluarga", "Pantau", "shield-check", ["caregiver", "monitor", "caregiver-link", "sos-active"]],
      ["notifications", "Notifikasi", "Notifikasi", "bell", ["notifications", "notification-settings"]],
      [
        "settings",
        "Pengaturan",
        "Profil",
        "circle-user",
        SETTINGS_GROUP.filter((x) => !x.startsWith("notification") && x !== "caregiver-link"),
      ],
    ];
  if (r === "volunteer") {
    const it: NavItem[] = [["dashboard", "Dashboard", "Dashboard", "layout-dashboard", ["dashboard"]]];
    if (s.verified) {
      it.push(["sos-active", "SOS Masuk", "SOS", "siren", ["sos-active"]]);
      if (s.canCompanion)
        it.push([
          "volunteer-requests",
          "Permintaan Dampingan",
          "Permintaan",
          "clipboard-list",
          ["volunteer-requests", "volunteer-request", "volunteer-schedule"],
        ]);
      if (s.canMapData) it.push(["editor", "Peta Editor", "Peta", "git-branch", ["editor", "topology"]]);
      it.push(["service-area", "Wilayah Layanan", "Wilayah", "map-pin", ["service-area"]]);
    } else it.push(["volunteer-pending", "Status Verifikasi", "Status", "hourglass", ["volunteer-pending", "volunteer-register"]]);
    it.push(S);
    return it;
  }
  if (r === "admin")
    return [
      ["verification", "Antrean Verifikasi", "Verifikasi", "clipboard-check", ["verification", "review"]],
      ["volunteer-review", "Verifikasi Relawan", "Relawan", "badge-check", ["volunteer-review"]],
      ["editor", "Peta Editor", "Peta", "git-branch", ["editor", "topology"]],
      ["exports", "Ekspor Laporan", "Ekspor", "download", ["exports"]],
      ["settings", "Pengaturan", "Profil", "circle-user", SETTINGS_GROUP.filter((x) => x !== "exports")],
    ];
  return [
    [
      "home",
      "Beranda",
      "Beranda",
      "house",
      [
        "home",
        "search",
        "loading",
        "preview",
        "unreachable",
        "profile",
        "trip",
        "arrived",
        "feedback",
        "compare",
        "place",
        "sos",
        "sos-empty",
        "sos-active",
      ],
    ],
    ["report", "Laporkan Hambatan", "Lapor", "octagon-alert", ["report", "report-confirm", "report-sent", "my-reports"]],
    [
      "assistance",
      "Minta Pendamping",
      "Bantuan",
      "handshake",
      ["assistance", "assistance-form", "volunteers", "assistance-status", "volunteer-offers", "assistance-detail", "assistance-rating"],
    ],
    ["caregiver-link", "Keluarga", "Keluarga", "users", ["caregiver-link"]],
    ["communities", "Komunitas", "Komunitas", "users", ["communities", "community"]],
    S,
  ];
}

export function activeNav(items: NavItem[], route: string) {
  return (items.find((n) => n[0] === route) || items.find((n) => n[4].includes(route)))?.[0];
}

export const href = (route: string) => (route === "landing" ? "/" : `/${route}`);
