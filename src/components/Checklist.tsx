import { Check, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { ChecklistItem } from '../lib/types';
import { byPosition } from '../lib/utils';
import { useDraft } from './ui';

const STARTER = ['여권, 신분증', '항공권, 숙소 예약 확인', '카드, 현지 화폐', '휴대폰 충전기, 보조배터리', '유심 또는 eSIM', '여행자 보험', '상비약', '세면도구'];

export function Checklist({ tripId }: { tripId: string }) {
  const { db, actions } = useStore();
  const [text, setText] = useState('');
  const items = useMemo(
    () => (db?.checklist_items ?? []).filter((c) => c.trip_id === tripId).sort(byPosition),
    [db?.checklist_items, tripId],
  );
  const done = items.filter((i) => i.done).length;

  const add = () => {
    const lines = text.split('\n');
    actions.addChecklistItems(tripId, lines);
    setText('');
  };

  return (
    <div className="checklist">
      <form
        className="checklist-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="챙길 것이나 할 일 추가"
          aria-label="체크리스트 항목"
          maxLength={120}
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
          <Plus size={16} /> 추가
        </button>
      </form>

      {items.length === 0 ? (
        <div className="checklist-empty">
          <p>여행 전에 챙길 것을 적어 두면 빠뜨리지 않아요.</p>
          <button type="button" className="btn" onClick={() => actions.addChecklistItems(tripId, STARTER)}>
            기본 준비물 {STARTER.length}개 넣기
          </button>
        </div>
      ) : (
        <>
          <div className="checklist-progress">
            <span>
              {items.length}개 중 <b>{done}개</b> 챙김
            </span>
            <span className="bar">
              <i style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
            </span>
          </div>
          <ul className="checklist-list">
            {items.map((it) => (
              <ChecklistRow key={it.id} item={it} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const { actions } = useStore();
  const draft = useDraft(item.text, (v) => {
    if (v.trim()) actions.updateChecklistItem(item.id, { text: v.trim() });
  });
  return (
    <li className="check-row" data-done={item.done || undefined}>
      <button
        type="button"
        className="check-box"
        aria-pressed={item.done}
        aria-label={item.done ? `${item.text} 체크 해제` : `${item.text} 체크`}
        onClick={() => actions.updateChecklistItem(item.id, { done: !item.done })}
      >
        {item.done && <Check size={13} strokeWidth={3} />}
      </button>
      <input className="check-text" aria-label="항목 내용" maxLength={120} {...draft} />
      <button type="button" className="icon-btn check-del" aria-label={`${item.text} 삭제`} onClick={() => actions.deleteChecklistItem(item.id)}>
        <X size={15} />
      </button>
    </li>
  );
}
