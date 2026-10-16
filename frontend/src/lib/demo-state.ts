import { DESTINATIONS, type DemoAccount, type ProfileId, type Role } from "./data";
import type { LocationValue } from "./geocode";

export type GraphNode = { id: number; x: number; y: number; status: string; name: string; floor?: string };
export type GraphEdge = {
  id: number;
  a: number;
  b: number;
  status: string;
  width: number;
  surface: string;
  slope: number;
  stairs: number;
  guiding: string;
  covered?: boolean;
  kind?: string;
  reason?: string;
};
export type Report = {
  id: number;
  category: string;
  location: string;
  severity: string;
  description: string;
  status: string;
  date: string;

  point?: [number, number];
  corroboration_count?: number;
};
export type AssistanceRequest = {
  id: number;
  destination: string;
  date: string;
  time: string;
  duration: string;
  help?: string[];
  meeting: string;
  notes?: string;
  status: string;
  volunteer?: string;
  checkin?: boolean;

  mode?: "broadcast" | "invite";
  invitedVolunteer?: string;
  inviteStatus?: "pending" | "accepted" | "declined";

  destinationPoint?: [number, number];
  destinationAddress?: string;
  meetingPoint?: [number, number];
  meetingAddress?: string;
  meetingNote?: string;
};
export type Sharing = "trip_only" | "sos_only" | "always";

export const INITIAL = {
  notificationPreferences: {} as Record<string, boolean>,
  preferences: [] as string[],
  voiceRate: 0.9,
  familyEvents: [] as { label: string; time: string }[],
  activeTrip: false,
  name: "Ratna",
  profiles: ["blind"] as ProfileId[],
  stairs: "0",
  slope: "Landai",
  role: "blind_user" as Role,
  destination: DESTINATIONS[0],
  reportCategory: "Guiding block rusak",
  severity: "Sedang",
  reports: [] as Report[],
  requests: [] as AssistanceRequest[],
  saved: [] as string[],
  history: [] as { destination: string; duration?: number; date: string }[],
  sharing: "trip_only" as Sharing,
  contactName: "Ibu",
  contactPhone: "",
  onboard: 1,
  verified: false,
  canMapData: false,
  canCompanion: false,
  recent: [] as string[],
  communityId: "ugm",
  joinedCommunities: [] as string[],
  available: true,
  radius: 3,
  locale: "id",
  large: false,
  contrast: false,
  voice: true,
  ratings: [] as { type: string; rating: number; review: string }[],

  savedLocations: [] as (LocationValue & { label: string })[],

  serviceCenter: null as LocationValue | null,
  nodes: [
    { id: 1, x: 21, y: 27, status: "approved", name: "Pintu Utama" },
    { id: 2, x: 38, y: 44, status: "approved", name: "Koridor Barat" },
    { id: 3, x: 54, y: 61, status: "approved", name: "Ramp Timur" },
    { id: 4, x: 72, y: 26, status: "approved", name: "Puskesmas Mergangsan" },
  ] as GraphNode[],
  edges: [
    { id: 1, a: 1, b: 2, status: "approved", width: 140, surface: "Beton", slope: 3, stairs: 0, guiding: "Baik" },
    { id: 2, a: 2, b: 3, status: "approved", width: 160, surface: "Paving", slope: 4, stairs: 0, guiding: "Baik" },
    { id: 3, a: 3, b: 4, status: "draft", width: 140, surface: "Beton", slope: 5, stairs: 0, guiding: "Baik" },
  ] as GraphEdge[],
};

const SESSION = {
  step: 0,
  paused: false,
  menu: false,
  filter: "Semua",
  mapMode: 1,
  selectedNode: null as number | null,
  selectedEdge: null as number | null,
  currentFloor: "Luar",
  edgeStart: null as number | null,
  pendingEdge: null as { a: number; b: number } | null,
  sosActive: false,
  noResponder: false,
  requestTab: "Menunggu",
  permissionLocation: false,
  permissionVoice: false,
  rating: 0,
  compareA: undefined as ProfileId | undefined,
  compareB: undefined as ProfileId | undefined,
  compareFrom: undefined as string | undefined,
  compareDestination: undefined as string | undefined,
  communityTab: undefined as string | undefined,
  loginAccount: undefined as DemoAccount | undefined,
  authMode: undefined as string | undefined,
  phone: undefined as string | undefined,

  pendingDestination: undefined as LocationValue | undefined,
};

export type DemoState = typeof INITIAL & typeof SESSION;

export const STORAGE_KEY = "unstoppable-demo-v1";
const PERSISTED = Object.keys(INITIAL) as (keyof typeof INITIAL)[];

export function initialState(): DemoState {
  return { ...structuredClone(INITIAL), ...structuredClone(SESSION) };
}

export function loadSaved(): Partial<DemoState> {
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {}
  const alias: Record<string, string> = { low: "low_vision", wheel: "wheelchair", walker: "crutches" };
  saved.profiles = ((saved.profiles as string[]) || INITIAL.profiles).map((id) => alias[id] || id);
  if (saved.role === "user") saved.role = "blind_user";
  if (typeof saved.destination === "string" && saved.destination.includes("UGM")) saved.destination = DESTINATIONS[0];
  return saved as Partial<DemoState>;
}

export function persist(state: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, state[k]]))));
  } catch {}
}

export function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function routeStats(s: Pick<DemoState, "profiles">) {
  const wheel = s.profiles.includes("wheelchair");
  return { distance: wheel ? 412 : 260, time: wheel ? 9 : 5, obstacles: wheel ? 1 : 0 };
}

export function canMonitor(s: DemoState) {
  return !!s.contactName && (s.sharing === "always" || s.sosActive || (s.sharing === "trip_only" && s.activeTrip));
}

export function sharingText(s: DemoState) {
  if (!s.contactName) return "Lokasi tidak dibagikan";
  if (s.sharing === "sos_only" && !s.sosActive) return "Lokasi hanya dibagikan saat darurat";
  if (canMonitor(s)) return s.activeTrip ? `${s.contactName} melihat perjalanan Anda` : `${s.contactName} dapat melihat lokasi Anda`;
  return "Lokasi tidak dibagikan";
}

export const wibNow = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
