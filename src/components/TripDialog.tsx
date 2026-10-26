import { useEffect, useState } from 'react';
import type { NewTripInput } from '../lib/store';
import type { Trip, TripRegion } from '../lib/types';
import { LINE_COLORS, toDateString, addDays, parseDate, daysBetween } from '../lib/utils';
import { Modal } from './ui';

interface Props {
  open: boolean;
  /** 있으면 수정, 없으면 새로 만들기 */
  trip?: Trip | null;
  dayCount?: number;
  onClose: () => void;
  onSubmit: (input: NewTripInput) => void;
}

const COLOR_NAMES = ['파랑', '초록', '주황', '하늘', '보라', '갈색', '올리브', '분홍'];

export function TripDialog({ open, trip, dayCount = 1, onClose, onSubmit }: Props) {
  const editing = Boolean(trip);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [region, setRegion] = useState<TripRegion>('domestic');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState(LINE_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (trip) {
      setTitle(trip.title);
      setDestination(trip.destination ?? '');
      setRegion(trip.region ?? 'overseas');
      setStart(trip.start_date ?? '');
      const s = parseDate(trip.start_date);
      setEnd(s ? toDateString(addDays(s, Math.max(dayCount, 1) - 1)) : '');
      setColor(trip.color);
    } else {
      setTitle('');
      setDestination('');
      setRegion('domestic');
      setStart('');
      setEnd('');
      setColor(LINE_COLORS[Math.floor(Math.random() * LINE_COLORS.length)]);
    }
  }, [open, trip, dayCount]);

  const submit = () => {
    if (!title.trim()) {
      setError('여행 이름을 적어 주세요');
      return;
    }
    const s = parseDate(start);
    const e = parseDate(end);
    if (!editing && s && e && daysBetween(s, e) < 0) {
      setError('끝나는 날이 시작일보다 빨라요');
      return;
    }
    if (!editing && s && e && daysBetween(s, e) >= 60) {
      setError('한 여행은 60일까지 만들 수 있어요');
      return;
    }
    onSubmit({
      title,
      destination: destination || null,
      region,
      start_date: start || null,
      end_date: editing ? null : end || start || null,
      color,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '여행 정보 수정' : '새 여행 만들기'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" form="trip-form" className="btn btn-primary">
            {editing ? '저장' : '여행 만들기'}
          </button>
        </>
      }
    >
      <form
        id="trip-form"
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset className="field">
          <legend>어디로 가세요?</legend>
          <div className="region-switch">
            <label className="region-option">
              <input type="radio" name="trip-region" value="domestic" checked={region === 'domestic'} onChange={() => setRegion('domestic')} />
              <span>
                <b>국내 여행</b>
                <small>카카오맵으로 검색하고 경로를 계산해요</small>
              </span>
            </label>
            <label className="region-option">
              <input type="radio" name="trip-region" value="overseas" checked={region === 'overseas'} onChange={() => setRegion('overseas')} />
              <span>
                <b>해외 여행</b>
                <small>구글 지도로 검색하고 경로를 계산해요</small>
              </span>
            </label>
          </div>
        </fieldset>
        <label className="field">
          <span>여행 이름</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={region === 'domestic' ? '예: 강릉 바다 여행' : '예: 오사카 먹방 여행'}
            maxLength={60}
          />
        </label>
        <label className="field">
          <span>여행지</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={region === 'domestic' ? '예: 강원 강릉' : '예: 일본 오사카'}
            maxLength={60}
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{editing ? '1일차 날짜' : '시작일'}</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          {!editing && (
            <label className="field">
              <span>종료일</span>
              <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </label>
          )}
        </div>
        {editing ? (
          <p className="field-hint">날짜 수는 일정 탭의 날짜 줄에서 늘리거나 지울 수 있어요.</p>
        ) : (
          <p className="field-hint">날짜를 비워 두면 1일차만 만들어져요. 나중에 언제든 추가할 수 있어요.</p>
        )}
        <fieldset className="field">
          <legend>목록 색상</legend>
          <div className="swatches">
            {LINE_COLORS.map((c, i) => (
              <label key={c} className="swatch" style={{ ['--sw' as string]: c }} title={COLOR_NAMES[i]}>
                <input type="radio" name="trip-color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={COLOR_NAMES[i]} />
                <span />
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
