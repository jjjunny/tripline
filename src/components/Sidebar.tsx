import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileUp, GripVertical, LogOut, Plus, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useStore } from '../lib/store';
import type { Trip } from '../lib/types';
import { byPosition, tripRangeLabel, tripStatus } from '../lib/utils';

export interface Account {
  email: string;
  signOut: () => void;
}

interface Props {
  selectedTripId: string | null;
  onSelect: (id: string) => void;
  onNewTrip: () => void;
  account: Account | null;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ selectedTripId, onSelect, onNewTrip, account, open, onClose }: Props) {
  const { db, actions, showToast, backendKind } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const trips = useMemo(() => [...(db?.trips ?? [])].sort(byPosition), [db?.trips]);
  const stats = useMemo(() => {
    const m = new Map<string, { days: number; total: number; visited: number }>();
    for (const t of trips) m.set(t.id, { days: 0, total: 0, visited: 0 });
    for (const d of db?.trip_days ?? []) {
      const s = m.get(d.trip_id);
      if (s) s.days++;
    }
    for (const st of db?.stops ?? []) {
      const s = m.get(st.trip_id);
      if (s && st.day_id) {
        s.total++;
        if (st.visited) s.visited++;
      }
    }
    return m;
  }, [trips, db?.trip_days, db?.stops]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = trips.map((t) => t.id);
    actions.reorderTrips(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const onImportFile = async (file: File) => {
    try {
      const n = actions.importTrips(JSON.parse(await file.text()));
      showToast(`여행 ${n}개를 가져왔어요`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '파일을 읽지 못했어요', 'error');
    }
  };

  return (
    <aside className="sidebar" data-open={open || undefined} aria-label="여행 목록">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M5 22 C 9 22, 9 6, 14 6 S 19 22, 23 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="5" cy="22" r="3.2" fill="#fff" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="14" cy="6" r="3.2" fill="#fff" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="23" cy="22" r="3.2" fill="currentColor" stroke="currentColor" strokeWidth="2.4" />
        </svg>
        <span className="brand-name">Tripline</span>
        <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="목록 닫기">
          <X size={18} />
        </button>
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={onNewTrip}>
        <Plus size={16} /> 새 여행
      </button>

      <div className="trip-list-head">
        <span>내 여행</span>
        <span className="count">{trips.length}</span>
      </div>

      {trips.length === 0 ? (
        <p className="sidebar-empty">만든 여행이 여기에 쌓여요. 새 여행부터 만들어 보세요.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={trips.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul className="trip-list">
              {trips.map((t) => (
                <TripItem
                  key={t.id}
                  trip={t}
                  active={t.id === selectedTripId}
                  stats={stats.get(t.id) ?? { days: 0, total: 0, visited: 0 }}
                  onSelect={() => {
                    onSelect(t.id);
                    onClose();
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="sidebar-foot">
        <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
          <FileUp size={15} /> JSON 파일에서 여행 가져오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = '';
          }}
        />
        {account ? (
          <div className="account">
            <span className="account-email" title={account.email}>
              {account.email}
            </span>
            <button type="button" className="icon-btn" onClick={account.signOut} aria-label="로그아웃" title="로그아웃">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          backendKind === 'local' && (
            <p className="local-note">
              로컬 모드: 이 브라우저에만 저장돼요. Supabase를 연결하면 로그인해서 여러 기기에서 쓸 수 있어요.
            </p>
          )
        )}
      </div>
    </aside>
  );
}

function TripItem({
  trip,
  active,
  stats,
  onSelect,
}: {
  trip: Trip;
  active: boolean;
  stats: { days: number; total: number; visited: number };
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: trip.id });
  const status = tripStatus(trip, stats.days);
  const pct = stats.total ? Math.round((stats.visited / stats.total) * 100) : 0;

  return (
    <li
      ref={setNodeRef}
      className="trip-item"
      data-active={active || undefined}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition, ['--trip' as string]: trip.color }}
    >
      <button type="button" className="trip-select" onClick={onSelect} aria-current={active ? 'true' : undefined}>
        <span className="trip-title">{trip.title}</span>
        <span className="trip-meta">{tripRangeLabel(trip, stats.days)}</span>
        <span className="trip-progress" aria-label={`장소 ${stats.total}곳 중 ${stats.visited}곳 방문`}>
          <span className="trip-progress-bar">
            <i style={{ width: `${pct}%` }} />
          </span>
          <span className="trip-progress-text">
            {stats.total ? `${stats.visited}/${stats.total}` : '장소 없음'}
          </span>
        </span>
      </button>
      <div className="trip-side">
        <span className={`trip-badge tone-${status.tone}`}>{status.label}</span>
        <button type="button" className="trip-grip" aria-label={`${trip.title} 순서 바꾸기`} {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
      </div>
    </li>
  );
}
