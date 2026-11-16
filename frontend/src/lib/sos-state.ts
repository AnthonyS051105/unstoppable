import { useSyncExternalStore } from 'react';
import { DEMO_DESTINATION } from '@/lib/geo';
import { live } from '@/lib/live';
import type { SosIncidentStatus, SosResponder } from '@/types/sos';

export type SosActiveState = {
  sosId: string;
  status: SosIncidentStatus;
  notifiedVolunteers: number;
  notifiedCaregivers: number;
  responders: SosResponder[];
  createdAt?: string;
  error?: string | null;
};

const STORAGE_KEY = 'unstoppable-active-sos-v1';

let activeSos: SosActiveState | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function loadInitialState(): SosActiveState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SosActiveState) : null;
  } catch {
    return null;
  }
}

activeSos = loadInitialState();

function persist(state: SosActiveState | null) {
  if (typeof window === 'undefined') return;
  try {
    if (state) {
      const json = JSON.stringify(state);
      sessionStorage.setItem(STORAGE_KEY, json);
      localStorage.setItem(STORAGE_KEY, json);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Abaikan kegagalan storage
  }
}

export const sosStore = {
  get: () => activeSos,
  set: (state: SosActiveState | null) => {
    activeSos = state;
    persist(state);
    notify();
  },
  clear: () => {
    activeSos = null;
    persist(null);
    notify();
  },
  updateResponders: (responders: SosResponder[], status?: SosIncidentStatus) => {
    if (!activeSos) {
      activeSos = {
        sosId: '',
        status: status || 'active',
        notifiedVolunteers: responders.length,
        notifiedCaregivers: 0,
        responders,
      };
    } else {
      activeSos = {
        ...activeSos,
        responders,
        ...(status ? { status } : {}),
      };
    }
    persist(activeSos);
    notify();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

export function useSosState(): SosActiveState | null {
  return useSyncExternalStore(
    sosStore.subscribe,
    sosStore.get,
    () => null,
  );
}

/**
 * Mengambil koordinat GPS terkini [longitude, latitude].
 * Jika izin ditolak atau timeout, fallback ke live origin atau koordinat pusat demo Yogyakarta.
 */
export async function getCurrentGpsLocation(): Promise<[number, number]> {
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 4000,
          maximumAge: 30000,
          enableHighAccuracy: true,
        });
      });
      return [pos.coords.longitude, pos.coords.latitude];
    } catch {
      // Fallback
    }
  }
  if (live.origin?.point?.coordinates) {
    return live.origin.point.coordinates;
  }
  return DEMO_DESTINATION; // [110.3753222, -7.8101201]
}

/**
 * Mengambil id sesi perjalanan yang sedang aktif jika ada.
 */
export function getActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('unstoppable-active-session-v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ?? null;
  } catch {
    return null;
  }
}
