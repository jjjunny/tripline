import type { ChecklistItem, Stop, Trip, TripDay } from '../lib/types';
import { byPosition, dayColor, dayDate, fmtLong, tripRangeLabel } from '../lib/utils';

/** 인쇄(또는 PDF로 저장)할 때만 보이는 일정표 */
export function PrintView({
  trip,
  days,
  stops,
  checklist,
}: {
  trip: Trip;
  days: TripDay[];
  stops: Stop[];
  checklist: ChecklistItem[];
}) {
  const inbox = stops.filter((s) => !s.day_id).sort(byPosition);
  return (
    <div className="print-view">
      <header className="print-head">
        <h1>{trip.title}</h1>
        <p>
          {trip.destination ? `${trip.destination}, ` : ''}
          {tripRangeLabel(trip, days.length)}
        </p>
      </header>

      {days.map((d) => {
        const date = dayDate(trip, d);
        const list = stops.filter((s) => s.day_id === d.id).sort(byPosition);
        return (
          <section key={d.id} className="print-day" style={{ ['--c' as string]: dayColor(d.position) }}>
            <h2>
              <span className="print-badge">{d.position + 1}</span>
              {d.position + 1}일차{date ? `, ${fmtLong(date)}` : ''}
              {d.title ? ` – ${d.title}` : ''}
            </h2>
            {list.length === 0 ? (
              <p className="print-empty">일정 없음</p>
            ) : (
              <ol>
                {list.map((s) => (
                  <li key={s.id}>
                    <span className="print-check">{s.visited ? '✓' : ''}</span>
                    <span className="print-time">{s.visit_time ?? ''}</span>
                    <span className="print-main">
                      <b>{s.name}</b>
                      {s.address && <small>{s.address}</small>}
                      {s.memo && <em>{s.memo}</em>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}

      {inbox.length > 0 && (
        <section className="print-day">
          <h2>보관함</h2>
          <ol>
            {inbox.map((s) => (
              <li key={s.id}>
                <span className="print-check" />
                <span className="print-time" />
                <span className="print-main">
                  <b>{s.name}</b>
                  {s.address && <small>{s.address}</small>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {checklist.length > 0 && (
        <section className="print-day">
          <h2>준비물</h2>
          <ul className="print-checklist">
            {[...checklist].sort(byPosition).map((c) => (
              <li key={c.id}>
                <span className="print-check">{c.done ? '✓' : ''}</span>
                {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
