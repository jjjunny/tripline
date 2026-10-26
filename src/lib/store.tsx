import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Backend } from './backend';
import type { ChecklistItem, DB, PlaceInput, Stop, TableName, Trip, TripDay, TripRegion } from './types';
import { addDays, byPosition, daysBetween, parseDate, toDateString, uid } from './utils';

type Op =
  | { type: 'upsert'; table: TableName; rows: DB[TableName] }
  | { type: 'remove'; table: TableName; ids: string[] };

export interface NewTripInput {
  title: string;
  destination: string | null;
  region: TripRegion;
  start_date: string | null;
  end_date: string | null;
  color: string;
}

export interface TripExport {
  app: 'tripline';
  version: 1;
  exported_at: string;
  trips: { trip: Trip; days: TripDay[]; stops: Stop[]; checklist: ChecklistItem[] }[];
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

function useStoreValue(backend: Backend) {
  const [db, setDb] = useState<DB | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const dbRef = useRef<DB | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const showToast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  const reload = useCallback(() => {
    setLoadError(null);
    backend
      .load()
      .then((loaded) => {
        // 국내/해외 구분이 생기기 전에 만든 여행은 해외(구글)로 취급
        const d = { ...loaded, trips: loaded.trips.map((t) => ({ ...t, region: t.region ?? 'overseas' })) };
        dbRef.current = d;
        setDb(d);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [backend]);

  useEffect(() => {
    dbRef.current = null;
    setDb(null);
    reload();
  }, [reload]);

  /** 화면 상태를 먼저 바꾸고(낙관적 업데이트) 저장 작업은 순서대로 처리 */
  const commit = useCallback(
    (next: DB, ops: Op[]) => {
      dbRef.current = next;
      setDb(next);
      for (const op of ops) {
        queue.current = queue.current
          .then(() =>
            op.type === 'upsert' ? backend.upsert(op.table, op.rows as never) : backend.remove(op.table, op.ids),
          )
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            showToast(`저장하지 못했어요. 새로고침 후 다시 시도해 주세요. (${msg})`, 'error');
          });
      }
    },
    [backend, showToast],
  );

  const cur = () => {
    if (!dbRef.current) throw new Error('데이터를 아직 불러오지 않았어요');
    return dbRef.current;
  };

  /* ---------------- trips ---------------- */

  const createTrip = useCallback(
    (input: NewTripInput): string => {
      const db = cur();
      const minPos = db.trips.reduce((m, t) => Math.min(m, t.position), 0);
      const trip: Trip = {
        id: uid(),
        title: input.title.trim() || '새 여행',
        destination: input.destination?.trim() || null,
        region: input.region,
        start_date: input.start_date || null,
        color: input.color,
        position: minPos - 1, // 새 여행은 목록 맨 위에 쌓임
      };
      const start = parseDate(input.start_date);
      const end = parseDate(input.end_date);
      let count = 1;
      if (start && end) count = Math.min(Math.max(daysBetween(start, end) + 1, 1), 60);
      const days: TripDay[] = Array.from({ length: count }, (_, i) => ({
        id: uid(),
        trip_id: trip.id,
        position: i,
        title: null,
        travel_mode: 'TRANSIT',
      }));
      commit({ ...db, trips: [...db.trips, trip], trip_days: [...db.trip_days, ...days] }, [
        { type: 'upsert', table: 'trips', rows: [trip] },
        { type: 'upsert', table: 'trip_days', rows: days },
      ]);
      return trip.id;
    },
    [commit],
  );

  const updateTrip = useCallback(
    (id: string, patch: Partial<Omit<Trip, 'id'>>) => {
      const db = cur();
      const t = db.trips.find((x) => x.id === id);
      if (!t) return;
      const next = { ...t, ...patch };
      commit({ ...db, trips: db.trips.map((x) => (x.id === id ? next : x)) }, [
        { type: 'upsert', table: 'trips', rows: [next] },
      ]);
    },
    [commit],
  );

  const deleteTrip = useCallback(
    (id: string) => {
      const db = cur();
      commit(
        {
          trips: db.trips.filter((t) => t.id !== id),
          trip_days: db.trip_days.filter((d) => d.trip_id !== id),
          stops: db.stops.filter((s) => s.trip_id !== id),
          checklist_items: db.checklist_items.filter((c) => c.trip_id !== id),
        },
        [{ type: 'remove', table: 'trips', ids: [id] }],
      );
    },
    [commit],
  );

  const reorderTrips = useCallback(
    (orderedIds: string[]) => {
      const db = cur();
      const pos = new Map(orderedIds.map((id, i) => [id, i]));
      const changed: Trip[] = [];
      const trips = db.trips.map((t) => {
        const p = pos.get(t.id);
        if (p === undefined || p === t.position) return t;
        const n = { ...t, position: p };
        changed.push(n);
        return n;
      });
      commit({ ...db, trips }, [{ type: 'upsert', table: 'trips', rows: changed }]);
    },
    [commit],
  );

  /* ---------------- days ---------------- */

  const addDay = useCallback(
    (tripId: string): string => {
      const db = cur();
      const days = db.trip_days.filter((d) => d.trip_id === tripId).sort(byPosition);
      const last = days[days.length - 1];
      const day: TripDay = {
        id: uid(),
        trip_id: tripId,
        position: last ? last.position + 1 : 0,
        title: null,
        travel_mode: last?.travel_mode ?? 'TRANSIT',
      };
      commit({ ...db, trip_days: [...db.trip_days, day] }, [{ type: 'upsert', table: 'trip_days', rows: [day] }]);
      return day.id;
    },
    [commit],
  );

  const updateDay = useCallback(
    (id: string, patch: Partial<Omit<TripDay, 'id' | 'trip_id'>>) => {
      const db = cur();
      const d = db.trip_days.find((x) => x.id === id);
      if (!d) return;
      const next = { ...d, ...patch };
      commit({ ...db, trip_days: db.trip_days.map((x) => (x.id === id ? next : x)) }, [
        { type: 'upsert', table: 'trip_days', rows: [next] },
      ]);
    },
    [commit],
  );

  /** 날짜를 지우면 그날의 장소는 보관함으로 옮기고, 이후 날짜는 하루씩 당겨짐 */
  const deleteDay = useCallback(
    (id: string) => {
      const db = cur();
      const day = db.trip_days.find((d) => d.id === id);
      if (!day) return;
      const inboxMax = db.stops
        .filter((s) => s.trip_id === day.trip_id && s.day_id === null)
        .reduce((m, s) => Math.max(m, s.position), -1);
      const moved: Stop[] = [];
      let k = 1;
      const stops = db.stops.map((s) => {
        if (s.day_id !== id) return s;
        const n = { ...s, day_id: null, position: inboxMax + k++ };
        moved.push(n);
        return n;
      });
      const remaining = db.trip_days
        .filter((d) => d.trip_id === day.trip_id && d.id !== id)
        .sort(byPosition);
      const reindexed: TripDay[] = [];
      remaining.forEach((d, i) => {
        if (d.position !== i) reindexed.push({ ...d, position: i });
      });
      const reMap = new Map(reindexed.map((d) => [d.id, d]));
      const trip_days = db.trip_days.filter((d) => d.id !== id).map((d) => reMap.get(d.id) ?? d);
      commit({ ...db, stops, trip_days }, [
        { type: 'upsert', table: 'stops', rows: moved },
        { type: 'remove', table: 'trip_days', ids: [id] },
        { type: 'upsert', table: 'trip_days', rows: reindexed },
      ]);
    },
    [commit],
  );

  /* ---------------- stops ---------------- */

  const addStop = useCallback(
    (tripId: string, dayId: string | null, place: PlaceInput): string => {
      const db = cur();
      const max = db.stops
        .filter((s) => s.trip_id === tripId && s.day_id === dayId)
        .reduce((m, s) => Math.max(m, s.position), -1);
      const stop: Stop = {
        id: uid(),
        trip_id: tripId,
        day_id: dayId,
        position: max + 1,
        place_id: place.place_id,
        name: place.name.trim() || '이름 없는 장소',
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        visited: false,
        visit_time: null,
        memo: null,
      };
      commit({ ...db, stops: [...db.stops, stop] }, [{ type: 'upsert', table: 'stops', rows: [stop] }]);
      return stop.id;
    },
    [commit],
  );

  const updateStop = useCallback(
    (id: string, patch: Partial<Omit<Stop, 'id' | 'trip_id'>>) => {
      const db = cur();
      const s = db.stops.find((x) => x.id === id);
      if (!s) return;
      const next = { ...s, ...patch };
      commit({ ...db, stops: db.stops.map((x) => (x.id === id ? next : x)) }, [
        { type: 'upsert', table: 'stops', rows: [next] },
      ]);
    },
    [commit],
  );

  const deleteStop = useCallback(
    (id: string) => {
      const db = cur();
      commit({ ...db, stops: db.stops.filter((s) => s.id !== id) }, [{ type: 'remove', table: 'stops', ids: [id] }]);
    },
    [commit],
  );

  const reorderStops = useCallback(
    (orderedIds: string[]) => {
      const db = cur();
      const pos = new Map(orderedIds.map((id, i) => [id, i]));
      const changed: Stop[] = [];
      const stops = db.stops.map((s) => {
        const p = pos.get(s.id);
        if (p === undefined || p === s.position) return s;
        const n = { ...s, position: p };
        changed.push(n);
        return n;
      });
      commit({ ...db, stops }, [{ type: 'upsert', table: 'stops', rows: changed }]);
    },
    [commit],
  );

  const moveStop = useCallback(
    (id: string, dayId: string | null) => {
      const db = cur();
      const s = db.stops.find((x) => x.id === id);
      if (!s || s.day_id === dayId) return;
      const max = db.stops
        .filter((x) => x.trip_id === s.trip_id && x.day_id === dayId)
        .reduce((m, x) => Math.max(m, x.position), -1);
      const next = { ...s, day_id: dayId, position: max + 1 };
      commit({ ...db, stops: db.stops.map((x) => (x.id === id ? next : x)) }, [
        { type: 'upsert', table: 'stops', rows: [next] },
      ]);
    },
    [commit],
  );

  /* ---------------- checklist ---------------- */

  const addChecklistItems = useCallback(
    (tripId: string, texts: string[]) => {
      const db = cur();
      let max = db.checklist_items
        .filter((c) => c.trip_id === tripId)
        .reduce((m, c) => Math.max(m, c.position), -1);
      const rows: ChecklistItem[] = texts
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ id: uid(), trip_id: tripId, text, done: false, position: ++max }));
      if (!rows.length) return;
      commit({ ...db, checklist_items: [...db.checklist_items, ...rows] }, [
        { type: 'upsert', table: 'checklist_items', rows },
      ]);
    },
    [commit],
  );

  const updateChecklistItem = useCallback(
    (id: string, patch: Partial<Pick<ChecklistItem, 'text' | 'done'>>) => {
      const db = cur();
      const c = db.checklist_items.find((x) => x.id === id);
      if (!c) return;
      const next = { ...c, ...patch };
      commit({ ...db, checklist_items: db.checklist_items.map((x) => (x.id === id ? next : x)) }, [
        { type: 'upsert', table: 'checklist_items', rows: [next] },
      ]);
    },
    [commit],
  );

  const deleteChecklistItem = useCallback(
    (id: string) => {
      const db = cur();
      commit({ ...db, checklist_items: db.checklist_items.filter((c) => c.id !== id) }, [
        { type: 'remove', table: 'checklist_items', ids: [id] },
      ]);
    },
    [commit],
  );

  /* ---------------- import / export ---------------- */

  const exportTrips = useCallback((tripIds: string[]): TripExport => {
    const db = cur();
    return {
      app: 'tripline',
      version: 1,
      exported_at: new Date().toISOString(),
      trips: db.trips
        .filter((t) => tripIds.includes(t.id))
        .sort(byPosition)
        .map((trip) => ({
          trip,
          days: db.trip_days.filter((d) => d.trip_id === trip.id).sort(byPosition),
          stops: db.stops.filter((s) => s.trip_id === trip.id).sort(byPosition),
          checklist: db.checklist_items.filter((c) => c.trip_id === trip.id).sort(byPosition),
        })),
    };
  }, []);

  /** 가져온 여행은 새 id 를 받아 목록 맨 위에 쌓임. 가져온 여행 수를 반환 */
  const importTrips = useCallback(
    (data: unknown): number => {
      const parsed = data as Partial<TripExport>;
      if (!parsed || parsed.app !== 'tripline' || !Array.isArray(parsed.trips)) {
        throw new Error('Tripline에서 내보낸 JSON 파일이 아니에요');
      }
      const db = cur();
      let minPos = db.trips.reduce((m, t) => Math.min(m, t.position), 0);
      const trips: Trip[] = [];
      const days: TripDay[] = [];
      const stops: Stop[] = [];
      const checklist: ChecklistItem[] = [];
      const strip = <T extends { user_id?: string; created_at?: string }>(r: T): T => {
        const c = { ...r };
        delete c.user_id;
        delete c.created_at;
        return c;
      };
      for (const entry of [...parsed.trips].reverse()) {
        const tripId = uid();
        trips.push({ ...strip(entry.trip), region: entry.trip.region ?? 'overseas', id: tripId, position: --minPos });
        const dayMap = new Map<string, string>();
        for (const d of entry.days ?? []) {
          const id = uid();
          dayMap.set(d.id, id);
          days.push({ ...strip(d), id, trip_id: tripId });
        }
        for (const s of entry.stops ?? []) {
          stops.push({ ...strip(s), id: uid(), trip_id: tripId, day_id: s.day_id ? dayMap.get(s.day_id) ?? null : null });
        }
        for (const c of entry.checklist ?? []) {
          checklist.push({ ...strip(c), id: uid(), trip_id: tripId });
        }
      }
      commit(
        {
          trips: [...db.trips, ...trips],
          trip_days: [...db.trip_days, ...days],
          stops: [...db.stops, ...stops],
          checklist_items: [...db.checklist_items, ...checklist],
        },
        [
          { type: 'upsert', table: 'trips', rows: trips },
          { type: 'upsert', table: 'trip_days', rows: days },
          { type: 'upsert', table: 'stops', rows: stops },
          { type: 'upsert', table: 'checklist_items', rows: checklist },
        ],
      );
      return trips.length;
    },
    [commit],
  );

  const actions = useMemo(
    () => ({
      createTrip,
      updateTrip,
      deleteTrip,
      reorderTrips,
      addDay,
      updateDay,
      deleteDay,
      addStop,
      updateStop,
      deleteStop,
      reorderStops,
      moveStop,
      addChecklistItems,
      updateChecklistItem,
      deleteChecklistItem,
      exportTrips,
      importTrips,
    }),
    [
      createTrip,
      updateTrip,
      deleteTrip,
      reorderTrips,
      addDay,
      updateDay,
      deleteDay,
      addStop,
      updateStop,
      deleteStop,
      reorderStops,
      moveStop,
      addChecklistItems,
      updateChecklistItem,
      deleteChecklistItem,
      exportTrips,
      importTrips,
    ],
  );

  return { db, loadError, reload, toast, showToast, dismissToast: () => setToast(null), actions, backendKind: backend.kind };
}

export type Store = ReturnType<typeof useStoreValue>;
export type Actions = Store['actions'];

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const value = useStoreValue(backend);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('StoreProvider 안에서만 사용할 수 있어요');
  return s;
}

/** 여행의 마지막 날짜 (YYYY-MM-DD) */
export function tripEndDate(trip: Trip, dayCount: number): string | null {
  const start = parseDate(trip.start_date);
  return start ? toDateString(addDays(start, Math.max(dayCount, 1) - 1)) : null;
}
