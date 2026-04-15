export type WeatherRecord = {
  id?: number;
  date: string;
  location_key?: string;
  latitude?: number;
  longitude?: number;
  temperature_max?: number;
  temperature_min?: number;
  temperature_avg?: number;
  precipitation_sum?: number;
  relative_humidity_avg?: number;
  wind_speed_max?: number;
  soil_moisture_avg?: number;
  data_source?: string;
};

export type ForecastRecord = {
  id?: number;
  date: string;
  latitude?: number;
  longitude?: number;
  temperature_max?: number;
  temperature_min?: number;
  precipitation_sum?: number;
  wind_speed_max?: number;
  relative_humidity_avg?: number;
};