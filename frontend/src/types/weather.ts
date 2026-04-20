// Represents one day of historical weather data fetched from an external weather API
// and stored locally so the ML model can train and predict without hitting the API repeatedly.
// Most fields are optional because not every data source provides every measurement.
export type WeatherRecord = {
  id?:                   number;  // auto-incremented database primary key — absent before the record is saved
  date:                  string;  // the calendar date this record covers, formatted as YYYY-MM-DD
  location_key?:         string;  // slug identifying the monitored area, e.g. "lumbini_np"
  latitude?:             number;  // geographic latitude of the weather observation point
  longitude?:            number;  // geographic longitude of the weather observation point
  temperature_max?:      number;  // highest temperature recorded during this day in degrees Celsius
  temperature_min?:      number;  // lowest temperature recorded during this day in degrees Celsius
  temperature_avg?:      number;  // mean temperature across the full day in degrees Celsius
  precipitation_sum?:    number;  // total rainfall for the day in millimetres
  relative_humidity_avg?:number;  // mean relative humidity across the day as a percentage (0–100)
  wind_speed_max?:       number;  // peak wind speed recorded during the day in km/h
  soil_moisture_avg?:    number;  // mean volumetric soil moisture for the day (0–1 fraction)
  data_source?:          string;  // which API or service provided this record, e.g. "open-meteo"
};

// Represents one day of weather forecast data fetched from a forecast API endpoint.
// Used to feed upcoming conditions into the ML model so it can predict future fire risk.
// Carries fewer fields than WeatherRecord because forecast APIs typically provide less detail
// than historical archives, and soil moisture is rarely available in short-range forecasts.
export type ForecastRecord = {
  id?:                   number;  // auto-incremented database primary key — absent before the record is saved
  date:                  string;  // the calendar date being forecast, formatted as YYYY-MM-DD
  latitude?:             number;  // geographic latitude of the forecast point
  longitude?:            number;  // geographic longitude of the forecast point
  temperature_max?:      number;  // forecast high temperature for the day in degrees Celsius
  temperature_min?:      number;  // forecast low temperature for the day in degrees Celsius
  precipitation_sum?:    number;  // forecast total rainfall for the day in millimetres
  wind_speed_max?:       number;  // forecast peak wind speed for the day in km/h
  relative_humidity_avg?:number;  // forecast mean relative humidity for the day as a percentage (0–100)
};