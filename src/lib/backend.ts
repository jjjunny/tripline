import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyDB, type DB, type TableName } from './types';
import { safeStorage } from './utils';

/**
 * 저장소 추상화. 앱은 모든 데이터를 한 번에 불러와 메모리에 들고 있고,
 * 변경이 생길 때마다 바뀐 행만 upsert / remove 합니다.
 */
export interface Backend {
  kind: 'local' | 'supabase';
  load(): Promise<DB>;
  upsert<T extends TableName>(table: T, rows: DB[T]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
}

/* ---------------- 로컬(브라우저) 저장 ---------------- */

const LOCAL_KEY = 'tripline:db:v1';

export class LocalBackend implements Backend {
  kind = 'local' as const;
  private store = safeStorage();

  private read(): DB {
    const raw = this.store.get(LOCAL_KEY);
    if (!raw) return emptyDB();
    try {
      return { ...emptyDB(), ...(JSON.parse(raw) as Partial<DB>) };
    } catch {
      return emptyDB();
    }
  }

  private write(db: DB) {
    this.store.set(LOCAL_KEY, JSON.stringify(db));
  }

  async load(): Promise<DB> {
    return this.read();
  }

  async upsert<T extends TableName>(table: T, rows: DB[T]): Promise<void> {
    const db = this.read();
    const list = db[table] as { id: string }[];
    const byId = new Map(list.map((r, i) => [r.id, i]));
    for (const row of rows as { id: string }[]) {
      const i = byId.get(row.id);
      if (i === undefined) list.push(row);
      else list[i] = row;
    }
    this.write(db);
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    const db = this.read();
    const set = new Set(ids);
    if (table === 'trips') {
      // 서버의 on delete cascade 와 똑같이 동작
      db.trips = db.trips.filter((t) => !set.has(t.id));
      db.trip_days = db.trip_days.filter((d) => !set.has(d.trip_id));
      db.stops = db.stops.filter((s) => !set.has(s.trip_id));
      db.checklist_items = db.checklist_items.filter((c) => !set.has(c.trip_id));
    } else if (table === 'trip_days') {
      db.trip_days = db.trip_days.filter((d) => !set.has(d.id));
      db.stops = db.stops.map((s) => (s.day_id && set.has(s.day_id) ? { ...s, day_id: null } : s));
    } else {
      (db[table] as { id: string }[]) = (db[table] as { id: string }[]).filter((r) => !set.has(r.id));
    }
    this.write(db);
  }
}

/* ---------------- Supabase ---------------- */

export class SupabaseBackend implements Backend {
  kind = 'supabase' as const;
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}

  async load(): Promise<DB> {
    const tables: TableName[] = ['trips', 'trip_days', 'stops', 'checklist_items'];
    const results = await Promise.all(
      tables.map((t) => this.client.from(t).select('*').order('position', { ascending: true })),
    );
    const db = emptyDB();
    results.forEach((res, i) => {
      if (res.error) throw new Error(res.error.message);
      (db[tables[i]] as unknown[]) = res.data ?? [];
    });
    return db;
  }

  async upsert<T extends TableName>(table: T, rows: DB[T]): Promise<void> {
    if (rows.length === 0) return;
    const payload = (rows as unknown as Record<string, unknown>[]).map((r) => ({ ...r, user_id: this.userId }));
    // defaultToNull: false → 행에 없는 컬럼(created_at 등)은 null 대신 DB 기본값을 사용
    const { error } = await this.client.from(table).upsert(payload, { defaultToNull: false });
    if (error) throw new Error(error.message);
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.client.from(table).delete().in('id', ids);
    if (error) throw new Error(error.message);
  }
}
