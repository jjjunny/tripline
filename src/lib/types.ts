export type TravelMode = 'DRIVING' | 'WALKING' | 'TRANSIT' | 'BICYCLING';

/** 국내 여행은 카카오맵, 해외 여행은 구글 지도 */
export type TripRegion = 'domestic' | 'overseas';
export type MapProvider = 'kakao' | 'google';

export const providerFor = (region: TripRegion | undefined | null): MapProvider =>
  region === 'domestic' ? 'kakao' : 'google';

export interface Trip {
  id: string;
  user_id?: string;
  title: string;
  destination: string | null;
  region: TripRegion;
  /** YYYY-MM-DD. 1일차의 날짜. 비어 있으면 날짜 미정 */
  start_date: string | null;
  color: string;
  position: number;
  created_at?: string;
}

export interface TripDay {
  id: string;
  trip_id: string;
  user_id?: string;
  position: number;
  title: string | null;
  travel_mode: TravelMode;
  created_at?: string;
}

export interface Stop {
  id: string;
  trip_id: string;
  /** null 이면 보관함 */
  day_id: string | null;
  user_id?: string;
  position: number;
  place_id: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  visited: boolean;
  /** HH:MM */
  visit_time: string | null;
  memo: string | null;
  created_at?: string;
}

export interface ChecklistItem {
  id: string;
  trip_id: string;
  user_id?: string;
  text: string;
  done: boolean;
  position: number;
  created_at?: string;
}

export interface DB {
  trips: Trip[];
  trip_days: TripDay[];
  stops: Stop[];
  checklist_items: ChecklistItem[];
}

export type TableName = keyof DB;

export interface PlaceInput {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
}

/** 선택된 날: 날짜 id 또는 보관함 */
export type DayKey = string | 'inbox';

export const emptyDB = (): DB => ({ trips: [], trip_days: [], stops: [], checklist_items: [] });
