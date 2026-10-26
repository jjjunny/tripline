import {
  APILoadingStatus,
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  InfoWindow,
  Map,
  Polyline,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Check, ExternalLink, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GOOGLE_MAP_ID } from '../config';
import { useLegs } from '../lib/legs';
import type { Stop } from '../lib/types';
import { hasCoords, type LatLng } from '../lib/utils';
import { MapNotice, MapToggle, SEOUL, useMapLines, type MapViewProps, type Pin } from './mapShared';

/** 해외 여행용 지도. 구글 지도 스크립트를 불러오지 못하면 빈 지도 대신 원인을 알려 줌 */
export function GoogleMapArea(props: MapViewProps) {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <MapNotice title="구글 지도 API 키를 확인해 주세요">
        <p>
          키가 잘못됐거나, 결제 계정이 연결되지 않았거나, 키의 웹사이트 제한에 지금 주소(예:{' '}
          <code>http://localhost:5173/*</code>)가 빠져 있을 때 생겨요. 브라우저 개발자 도구 콘솔에 구글이 남긴 오류 이름이 있어요.
        </p>
      </MapNotice>
    );
  }
  if (status === APILoadingStatus.FAILED) {
    return (
      <MapNotice title="구글 지도를 불러오지 못했어요">
        <p>인터넷 연결을 확인하고, 광고 차단 확장 프로그램이 maps.googleapis.com을 막고 있지 않은지 확인해 주세요.</p>
      </MapNotice>
    );
  }
  return <MapView {...props} />;
}

function MapView(props: MapViewProps) {
  const { trip, days, stops, dayKey, showAll, onShowAll, selectedStopId, onSelectStop, onAddPlace, addLabel } = props;
  const legs = useLegs();
  const places = useMapsLibrary('places');
  const [poi, setPoi] = useState<{ id: string; position: LatLng; name?: string; address?: string | null } | null>(null);
  const { visible, pins, color, fitKey } = useMapLines(trip, days, stops, dayKey, showAll);

  const onMapClick = async (e: MapMouseEvent) => {
    const placeId = e.detail.placeId;
    if (!placeId || !e.detail.latLng) {
      setPoi(null);
      return;
    }
    e.stop(); // 구글 기본 정보창 대신 '일정에 추가' 카드 표시
    setPoi({ id: placeId, position: e.detail.latLng });
    if (!places) return;
    try {
      const place = new places.Place({ id: placeId });
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      setPoi((cur) =>
        cur?.id === placeId
          ? {
              id: placeId,
              name: place.displayName ?? '이름 없는 장소',
              address: place.formattedAddress ?? null,
              position: place.location ? { lat: place.location.lat(), lng: place.location.lng() } : cur.position,
            }
          : cur,
      );
    } catch (err) {
      console.error('[Tripline] 장소 정보를 가져오지 못함', err);
      setPoi((cur) => (cur?.id === placeId ? { ...cur, name: '장소 정보를 불러오지 못했어요' } : cur));
    }
  };

  return (
    <div className="map-wrap">
      <Map
        className="gmap"
        mapId={GOOGLE_MAP_ID}
        defaultCenter={SEOUL}
        defaultZoom={11}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        clickableIcons
        onClick={onMapClick}
      >
        <FitToPins pins={pins} fitKey={fitKey} />
        <PanToSelected stops={stops} selectedStopId={selectedStopId} />

        {/* 이날 동선: 계산된 실제 경로, 없으면 점선 직선 */}
        {!showAll &&
          [...legs.values()].map((leg) =>
            leg.status === 'ok' && leg.path?.length ? (
              <RouteLine key={leg.key} path={leg.path} color={color} />
            ) : (
              <DashedLine key={leg.key} path={[leg.from, leg.to]} color={color} />
            ),
          )}

        {/* 전체 일정: 날짜별 직선 노선 */}
        {showAll &&
          visible
            .filter((l) => l.key !== 'inbox' && l.pins.length > 1)
            .map((l) => (
              <Polyline
                key={l.key}
                path={l.pins.map((p) => ({ lat: p.stop.lat, lng: p.stop.lng }))}
                strokeColor={l.color}
                strokeOpacity={0.8}
                strokeWeight={3}
                geodesic
                clickable={false}
              />
            ))}

        {pins.map((p) => (
          <AdvancedMarker
            key={p.stop.id}
            position={{ lat: p.stop.lat, lng: p.stop.lng }}
            anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
            zIndex={p.stop.id === selectedStopId ? 1000 : p.n}
            title={p.stop.name}
            onClick={() => onSelectStop(p.stop)}
          >
            <div
              className="pin"
              data-visited={p.stop.visited || undefined}
              data-selected={p.stop.id === selectedStopId || undefined}
              style={{ ['--c' as string]: p.color }}
            >
              {p.stop.visited ? <Check size={13} strokeWidth={3} /> : p.n}
            </div>
          </AdvancedMarker>
        ))}

        {poi && (
          <InfoWindow
            position={poi.position}
            onCloseClick={() => setPoi(null)}
            headerContent={<strong className="poi-title">{poi.name ?? '불러오는 중…'}</strong>}
            pixelOffset={[0, -6]}
          >
            <div className="poi">
              {poi.address && <p className="poi-addr">{poi.address}</p>}
              {trip ? (
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  disabled={!poi.name}
                  onClick={() => {
                    onAddPlace({
                      name: poi.name ?? '이름 없는 장소',
                      address: poi.address ?? null,
                      lat: poi.position.lat,
                      lng: poi.position.lng,
                      place_id: poi.id,
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
                href={`https://www.google.com/maps/search/?api=1&query=${poi.position.lat},${poi.position.lng}&query_place_id=${poi.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={13} /> 구글 지도에서 보기
              </a>
            </div>
          </InfoWindow>
        )}
      </Map>

      {trip && <MapToggle dayKey={dayKey} showAll={showAll} onShowAll={onShowAll} />}
    </div>
  );
}

function RouteLine({ path, color }: { path: LatLng[]; color: string }) {
  return (
    <>
      <Polyline path={path} strokeColor="#ffffff" strokeOpacity={0.95} strokeWeight={8} clickable={false} zIndex={1} />
      <Polyline path={path} strokeColor={color} strokeOpacity={1} strokeWeight={5} clickable={false} zIndex={2} />
    </>
  );
}

function DashedLine({ path, color }: { path: LatLng[]; color: string }) {
  return (
    <Polyline
      path={path}
      strokeOpacity={0}
      geodesic
      clickable={false}
      zIndex={1}
      icons={[
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, strokeWeight: 3, scale: 3 },
          offset: '0',
          repeat: '14px',
        },
      ]}
    />
  );
}

function FitToPins({ pins, fitKey }: { pins: Pin[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || pins.length === 0) return;
    if (pins.length === 1) {
      map.panTo({ lat: pins[0].stop.lat, lng: pins[0].stop.lng });
      map.setZoom(15);
      return;
    }
    const b = new google.maps.LatLngBounds();
    for (const p of pins) b.extend({ lat: p.stop.lat, lng: p.stop.lng });
    map.fitBounds(b, 64);
    // fitKey 가 바뀔 때만 다시 맞춤 (장소를 고칠 때마다 지도가 움직이지 않도록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

function PanToSelected({ stops, selectedStopId }: { stops: Stop[]; selectedStopId: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !selectedStopId) return;
    const s = stops.find((x) => x.id === selectedStopId);
    if (s && hasCoords(s)) map.panTo({ lat: s.lat, lng: s.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedStopId]);
  return null;
}
