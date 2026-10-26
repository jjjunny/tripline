import { APILoadingStatus, useApiLoadingStatus, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, PenLine, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { hasGoogleMaps, hasKakaoMaps } from '../config';
import { kakaoMapRef, useKakao } from '../lib/kakao';
import type { MapProvider, PlaceInput } from '../lib/types';

interface Props {
  placeholder: string;
  onPick: (place: PlaceInput) => void;
}

const MESSAGES = {
  google: {
    error: '장소 검색을 쓸 수 없어요. Google Cloud에서 Places API (New)를 사용 설정했는지 확인해 주세요.',
    unavailable: '구글 지도를 불러오지 못해 장소를 검색할 수 없어요. 이름만 추가하거나 API 키 설정을 확인해 주세요.',
  },
  kakao: {
    error: '카카오 장소 검색에 실패했어요. 카카오맵 사용 설정과 JavaScript SDK 도메인 등록을 확인해 주세요.',
    unavailable: '카카오 지도를 불러오지 못해 장소를 검색할 수 없어요. 이름만 추가하거나 카카오 키 설정을 확인해 주세요.',
  },
};

/** 국내 여행은 카카오, 해외 여행은 구글로 검색. 키가 없으면 이름만 입력해 추가 */
export function PlaceSearch({ provider, ...props }: Props & { provider: MapProvider }) {
  if (provider === 'kakao') {
    return hasKakaoMaps ? <KakaoPlaceSearch key="kakao" {...props} /> : <SearchBox {...props} suggestions={[]} status="manual" />;
  }
  return hasGoogleMaps ? <GooglePlaceSearch key="google" {...props} /> : <SearchBox {...props} suggestions={[]} status="manual" />;
}

/** "음식점 > 한식 > 냉면" → "냉면" */
const lastCategory = (c: string) => c.split('>').pop()?.trim() ?? '';

function KakaoPlaceSearch({ placeholder, onPick }: Props) {
  const { kakao: K, error } = useKakao();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    const q = query.trim();
    if (!K || !q) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    let stale = false;
    setStatus('loading');
    const t = setTimeout(() => {
      const places = new K.maps.services.Places();
      const options: kakao.maps.services.PlacesSearchOptions = { size: 8 };
      const center = kakaoMapRef.current?.getCenter();
      if (center) options.location = center; // 지도 중심에서의 거리 계산용
      places.keywordSearch(
        q,
        (data, st) => {
          if (stale) return;
          if (st === K.maps.services.Status.OK) {
            setSuggestions(
              data.slice(0, 6).map((d) => {
                const address = d.road_address_name || d.address_name || null;
                return {
                  id: d.id,
                  main: d.place_name,
                  secondary: [lastCategory(d.category_name), address].filter(Boolean).join(', '),
                  pick: async () => ({
                    name: d.place_name,
                    address,
                    lat: Number(d.y),
                    lng: Number(d.x),
                    place_id: `kakao:${d.id}`,
                  }),
                };
              }),
            );
            setStatus('idle');
          } else if (st === K.maps.services.Status.ZERO_RESULT) {
            setSuggestions([]);
            setStatus('idle');
          } else {
            setSuggestions([]);
            setStatus('error');
          }
        },
        options,
      );
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, K]);

  return (
    <SearchBox
      placeholder={placeholder}
      onPick={onPick}
      suggestions={suggestions}
      status={error ? 'unavailable' : K ? status : 'loading'}
      messages={MESSAGES.kakao}
      query={query}
      onQuery={setQuery}
    />
  );
}

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  pick: () => Promise<PlaceInput>;
}

function GooglePlaceSearch({ placeholder, onPick }: Props) {
  const places = useMapsLibrary('places');
  const map = useMap();
  const apiStatus = useApiLoadingStatus();
  const apiFailed = apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE;
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!places || !q) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }
    let stale = false;
    setStatus('loading');
    const t = setTimeout(async () => {
      try {
        token.current ??= new places.AutocompleteSessionToken();
        const req: google.maps.places.AutocompleteRequest = { input: q, sessionToken: token.current, language: 'ko' };
        const bounds = map?.getBounds();
        if (bounds) req.locationBias = bounds;
        const { suggestions: res } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        if (stale) return;
        setSuggestions(
          res
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => Boolean(p))
            .slice(0, 6)
            .map((p) => ({
              id: p.placeId,
              main: p.mainText?.text ?? p.text.text,
              secondary: p.secondaryText?.text ?? '',
              pick: async () => {
                const place = p.toPlace();
                await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location'] });
                token.current = null; // 장소를 고르면 검색 세션 종료
                return {
                  name: place.displayName ?? p.mainText?.text ?? p.text.text,
                  address: place.formattedAddress ?? (p.secondaryText?.text || null),
                  lat: place.location?.lat() ?? null,
                  lng: place.location?.lng() ?? null,
                  place_id: place.id ?? p.placeId,
                };
              },
            })),
        );
        setStatus('idle');
      } catch (e) {
        if (stale) return;
        console.error('[Tripline] 장소 검색 실패', e);
        setSuggestions([]);
        setStatus('error');
      }
    }, 220);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, places, map]);

  return (
    <SearchBox
      placeholder={placeholder}
      onPick={onPick}
      suggestions={suggestions}
      status={apiFailed ? 'unavailable' : places ? status : 'loading'}
      messages={MESSAGES.google}
      query={query}
      onQuery={setQuery}
    />
  );
}

function SearchBox({
  placeholder,
  onPick,
  suggestions,
  status,
  messages = MESSAGES.google,
  query: controlled,
  onQuery,
}: Props & {
  suggestions: Suggestion[];
  status: 'idle' | 'loading' | 'error' | 'unavailable' | 'manual';
  messages?: { error: string; unavailable: string };
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const [local, setLocal] = useState('');
  const query = controlled ?? local;
  const setQuery = onQuery ?? setLocal;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const options: { key: string; main: string; secondary: string; manual?: boolean; s?: Suggestion }[] = [
    ...suggestions.map((s) => ({ key: s.id, main: s.main, secondary: s.secondary, s })),
    ...(q ? [{ key: '__manual', main: `‘${q}’ 이름만 추가`, secondary: '지도 위치 없이 메모처럼 추가돼요', manual: true }] : []),
  ];

  useEffect(() => setActive(0), [suggestions.length, q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = async (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.manual) {
      onPick({ name: q, address: null, lat: null, lng: null, place_id: null });
    } else if (o.s) {
      setBusy(true);
      try {
        onPick(await o.s.pick());
      } catch (e) {
        console.error('[Tripline] 장소 정보를 가져오지 못함', e);
        onPick({ name: o.main, address: o.secondary || null, lat: null, lng: null, place_id: o.key });
      } finally {
        setBusy(false);
      }
    }
    setQuery('');
    setOpen(false);
  };

  const showList = open && q.length > 0;

  return (
    <div className="search" ref={wrapRef}>
      <Search size={16} className="search-icon" aria-hidden="true" />
      <input
        className="search-input"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        value={query}
        disabled={busy}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 무시
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            void choose(active);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <ul className="search-list" role="listbox" id={listId}>
          {status === 'loading' && suggestions.length === 0 && <li className="search-status">검색 중…</li>}
          {status === 'unavailable' && (
            <li className="search-status is-error">{messages.unavailable}</li>
          )}
          {status === 'error' && (
            <li className="search-status is-error">{messages.error}</li>
          )}
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`search-option${o.manual ? ' is-manual' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(i);
              }}
            >
              {o.manual ? <PenLine size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
              <span className="search-option-text">
                <span className="search-main">{o.main}</span>
                {o.secondary && <span className="search-secondary">{o.secondary}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
