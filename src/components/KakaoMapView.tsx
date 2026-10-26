import { ExternalLink, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { kakaoMapRef, useKakao } from '../lib/kakao';
import { useLegs } from '../lib/legs';
import { hasCoords, type LatLng } from '../lib/utils';
import { CHECK_SVG, MapNotice, MapToggle, SEOUL, useMapLines, type MapViewProps } from './mapShared';

type Kakao = typeof kakao;

/** 국내 여행용 지도. 카카오 SDK를 불러오지 못하면 원인을 알려 줌 */
export function KakaoMapArea(props: MapViewProps) {
  const { kakao: K, error } = useKakao();
  if (error) {
    return (
      <MapNotice title="카카오 지도를 불러오지 못했어요">
        <p>
          JavaScript 키가 맞는지, [앱] &gt; [플랫폼 키] &gt; [JavaScript 키]의 JavaScript SDK 도메인에 지금 주소(예:{' '}
          <code>http://localhost:5173</code>)가 등록돼 있는지, [제품 설정] &gt; [카카오맵] 사용 설정이 켜져 있는지 확인해 주세요.
          광고 차단 확장 프로그램이 dapi.kakao.com을 막고 있을 수도 있어요.
        </p>
      </MapNotice>
    );
  }
  if (!K) return <div className="map-wrap map-loading">카카오 지도를 불러오는 중…</div>;
  return <KakaoMapView {...props} K={K} />;
}

interface Poi {
  position: LatLng;
  name: string | null;
  address: string | null;
  loading: boolean;
}

function KakaoMapView({
  K,
  trip,
  days,
  stops,
  dayKey,
  showAll,
  onShowAll,
  selectedStopId,
  onSelectStop,
  onAddPlace,
  addLabel,
}: MapViewProps & { K: Kakao }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const [poi, setPoi] = useState<Poi | null>(null);
  const legs = useLegs();
  const { visible, pins, color, fitKey } = useMapLines(trip, days, stops, dayKey, showAll);
  const popupEl = useMemo(() => document.createElement('div'), []);
  const onSelectRef = useRef(onSelectStop);
  useEffect(() => {
    onSelectRef.current = onSelectStop;
  });

  /* 지도 만들기 */
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const m = new K.maps.Map(el, { center: new K.maps.LatLng(SEOUL.lat, SEOUL.lng), level: 7 });
    m.addControl(new K.maps.ZoomControl(), K.maps.ControlPosition.RIGHT);
    kakaoMapRef.current = m;
    setMap(m);
    const ro = new ResizeObserver(() => m.relayout());
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (kakaoMapRef.current === m) kakaoMapRef.current = null;
      el.innerHTML = '';
    };
  }, [K]);

  /* 지도를 누르면 그 위치의 주소를 찾아 '일정에 추가' 카드 표시 */
  useEffect(() => {
    if (!map) return;
    const geocoder = new K.maps.services.Geocoder();
    const onClick = (e: kakao.maps.event.MouseEvent) => {
      const position = { lat: e.latLng.getLat(), lng: e.latLng.getLng() };
      setPoi({ position, name: null, address: null, loading: true });
      geocoder.coord2Address(position.lng, position.lat, (result, status) => {
        const r = status === K.maps.services.Status.OK ? result[0] : undefined;
        const road = r?.road_address ?? null;
        const address = road?.address_name || r?.address.address_name || null;
        const name = road?.building_name || address || '지도에서 고른 위치';
        setPoi((cur) => (cur && cur.position === position ? { ...cur, name, address, loading: false } : cur));
      });
    };
    K.maps.event.addListener(map, 'click', onClick);
    return () => K.maps.event.removeListener(map, 'click', onClick);
  }, [map, K]);

  /* 위치 카드 오버레이 (내용은 아래 createPortal 로 React 가 그림) */
  const popupRef = useRef<kakao.maps.CustomOverlay | null>(null);
  useEffect(() => {
    if (!map) return;
    if (!poi) {
      popupRef.current?.setMap(null);
      return;
    }
    popupRef.current ??= new K.maps.CustomOverlay({
      position: new K.maps.LatLng(poi.position.lat, poi.position.lng),
      content: popupEl,
      xAnchor: 0.5,
      yAnchor: 1,
      zIndex: 3000,
      clickable: true,
    });
    popupRef.current.setPosition(new K.maps.LatLng(poi.position.lat, poi.position.lng));
    popupRef.current.setMap(map);
  }, [map, poi, K, popupEl]);
  useEffect(() => () => popupRef.current?.setMap(null), []);

  /* 역(장소) 표시 */
  useEffect(() => {
    if (!map) return;
    const overlays = pins.map((p) => {
      const el = document.createElement('div');
      el.className = 'pin';
      el.style.setProperty('--c', p.color);
      el.title = p.stop.name;
      if (p.stop.visited) {
        el.dataset.visited = 'true';
        el.innerHTML = CHECK_SVG;
      } else {
        el.textContent = String(p.n);
      }
      if (p.stop.id === selectedStopId) el.dataset.selected = 'true';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelectRef.current(p.stop);
      });
      return new K.maps.CustomOverlay({
        map,
        position: new K.maps.LatLng(p.stop.lat, p.stop.lng),
        content: el,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: p.stop.id === selectedStopId ? 1000 : 10 + p.n,
        clickable: true,
      });
    });
    return () => overlays.forEach((o) => o.setMap(null));
  }, [map, pins, selectedStopId, K]);

  /* 경로선 */
  useEffect(() => {
    if (!map) return;
    const toPath = (pts: LatLng[]) => pts.map((p) => new K.maps.LatLng(p.lat, p.lng));
    const lines: kakao.maps.Polyline[] = [];
    if (!showAll) {
      for (const leg of legs.values()) {
        if (leg.status === 'ok' && leg.path?.length) {
          const path = toPath(leg.path);
          lines.push(new K.maps.Polyline({ map, path, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.95, zIndex: 1 }));
          lines.push(new K.maps.Polyline({ map, path, strokeColor: color, strokeWeight: 5, strokeOpacity: 1, zIndex: 2 }));
        } else {
          lines.push(
            new K.maps.Polyline({
              map,
              path: toPath([leg.from, leg.to]),
              strokeColor: color,
              strokeWeight: 3,
              strokeOpacity: 0.9,
              strokeStyle: 'shortdash',
              zIndex: 1,
            }),
          );
        }
      }
    } else {
      for (const l of visible) {
        if (l.key === 'inbox' || l.pins.length < 2) continue;
        lines.push(
          new K.maps.Polyline({
            map,
            path: toPath(l.pins.map((p) => p.stop)),
            strokeColor: l.color,
            strokeWeight: 3,
            strokeOpacity: 0.8,
          }),
        );
      }
    }
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, legs, showAll, visible, color, K]);

  /* 날짜·여행이 바뀌면 장소들에 맞춰 화면 맞춤 */
  useEffect(() => {
    if (!map || pins.length === 0) return;
    if (pins.length === 1) {
      map.setCenter(new K.maps.LatLng(pins[0].stop.lat, pins[0].stop.lng));
      map.setLevel(4);
      return;
    }
    const b = new K.maps.LatLngBounds();
    for (const p of pins) b.extend(new K.maps.LatLng(p.stop.lat, p.stop.lng));
    map.setBounds(b, 64, 64, 64, 64);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);

  /* 목록에서 장소를 고르면 지도 이동 */
  useEffect(() => {
    if (!map || !selectedStopId) return;
    const s = stops.find((x) => x.id === selectedStopId);
    if (s && hasCoords(s)) map.panTo(new K.maps.LatLng(s.lat, s.lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedStopId]);

  return (
    <div className="map-wrap">
      <div ref={elRef} className="gmap kmap" />
      {trip && <MapToggle dayKey={dayKey} showAll={showAll} onShowAll={onShowAll} />}
      {poi &&
        createPortal(
          <div className="kpopup" onMouseDown={(e) => e.stopPropagation()}>
            <div className="kpopup-head">
              <strong className="poi-title">{poi.loading ? '주소 찾는 중…' : poi.name}</strong>
              <button type="button" className="icon-btn kpopup-close" aria-label="닫기" onClick={() => setPoi(null)}>
                <X size={15} />
              </button>
            </div>
            {poi.address && poi.address !== poi.name && <p className="poi-addr">{poi.address}</p>}
            {trip ? (
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={poi.loading}
                onClick={() => {
                  onAddPlace({
                    name: poi.name ?? '지도에서 고른 위치',
                    address: poi.address,
                    lat: poi.position.lat,
                    lng: poi.position.lng,
                    place_id: null,
                  });
                  setPoi(null);
                }}
              >
                <Plus size={14} /> {addLabel}
              </button>
            ) : (
              <p className="poi-addr">여행을 먼저 만들면 일정에 넣을 수 있어요.</p>
            )}
            <a
              className="link-btn"
              href={`https://map.kakao.com/link/map/${encodeURIComponent((poi.name ?? '위치').replace(/[,/]/g, ' '))},${poi.position.lat},${poi.position.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} /> 카카오맵에서 보기
            </a>
            <span className="kpopup-tail" aria-hidden="true" />
          </div>,
          popupEl,
        )}
    </div>
  );
}

