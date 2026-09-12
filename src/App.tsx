import { FormEvent, useEffect, useRef, useState } from 'react';
import { Cloud, Droplets, MapPin, Search, Sun, Thermometer, Wind, LoaderCircle, Mic, MicOff } from 'lucide-react';
import { GeocodingResult, reverseGeocode, searchCities, sendChat, WeatherData } from './lib/weather-api';

type SpeechRecognitionResultEvent = Event & { results: { [index: number]: { [index: number]: { transcript: string } } } };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type ForecastDay = { day: string; high: string; low: string; icon: string };

const starterForecast: ForecastDay[] = [
  { day: 'Today', high: '24°', low: '16°', icon: 'sun' },
  { day: 'Tomorrow', high: '22°', low: '15°', icon: 'cloud' },
  { day: 'Monday', high: '20°', low: '14°', icon: 'cloud' },
  { day: 'Tuesday', high: '23°', low: '15°', icon: 'sun' },
];

function value(data: WeatherData | null, key: keyof WeatherData, fallback: string) {
  const result = data?.[key];
  return result === undefined || result === null || result === '' ? fallback : String(result);
}

function forecastFromWeather(data: WeatherData | null): ForecastDay[] {
  if (!Array.isArray(data?.daily_forecast)) return starterForecast;
  return data.daily_forecast.slice(0, 4).map((item, index) => ({
    day: index === 0 ? 'Today' : new Date(String(item.date)).toLocaleDateString('en-US', { weekday: 'long' }),
    high: `${item.max_temp ?? '--'}°`,
    low: `${item.min_temp ?? '--'}°`,
    icon: Number(item.rain ?? 0) > 20 ? 'cloud' : 'sun',
  }));
}

function isWeatherOnlyQuery(query: string) {
  const normalized = query.toLowerCase().replace(/[?!.,']/g, '').trim();
  return /^(what is the |whats the |what's the |how is the |hows the )?(weather|weather today|weather like today|forecast|forecast today)$/.test(normalized);
}

function displayLocation(result: GeocodingResult) {
  return [result.name, result.admin1, result.country].filter(Boolean).join(', ');
}

function App() {
  const [location, setLocation] = useState('London');
  const [query, setQuery] = useState('');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [message, setMessage] = useState('A bright start with a little cloud later in the day.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<GeocodingResult | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const cityQuery = query.trim();
    if (!cityQuery || isWeatherOnlyQuery(cityQuery) || selectedPlace?.name === cityQuery) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        setSuggestions(await searchCities(cityQuery, controller.signal));
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selectedPlace]);

  function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => setQuery(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setError('Microphone access was not available. Allow microphone permission in your browser and try again');
    };
    recognitionRef.current = recognition;
    setError('');
    setListening(true);
    recognition.start();
  }

  async function loadWeather(city: string, latitude: number | null, longitude: number | null, resolvedLocation: string) {
    setLoading(true);
    setError('');
    try {
      const result = await sendChat({ message: city, lat: latitude, lon: longitude });
      if (result.intent === 'blocked' || !result.weather_data) {
        setMessage(result.response || 'Ask me about the weather, temperature, rain, or forecast.');
        setQuery('');
        setSelectedPlace(null);
        setSuggestions([]);
        return;
      }
      setLocation(result.location && result.location !== 'Current Location' ? result.location : resolvedLocation || 'Current Location');
      setWeather(result.weather_data);
      setMessage(result.response || 'Here is the latest forecast.');
      setQuery('');
      setSelectedPlace(null);
      setSuggestions([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The weather service is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const city = query.trim();
    if (!city) return;
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      let resolvedLocation = '';

      if (isWeatherOnlyQuery(city)) {
        if (!navigator.geolocation) throw new Error('Location detection is not supported in this browser. Please search for a city instead.');
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
        }).catch((locationError: GeolocationPositionError) => {
          if (locationError.code === locationError.PERMISSION_DENIED) throw new Error('Location access was denied. Please allow location permission or search for a city.');
          throw new Error('We could not detect your location. Please search for a city instead.');
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        const place = await reverseGeocode(latitude, longitude);
        resolvedLocation = [place.name, place.state, place.country].filter(Boolean).join(', ');
      } else {
        const coordinates = selectedPlace?.name === city ? selectedPlace : (await searchCities(city))[0];
        if (coordinates) {
          latitude = coordinates.latitude;
          longitude = coordinates.longitude;
          resolvedLocation = displayLocation(coordinates);
          setQuery(coordinates.name);
        }
      }

      await loadWeather(city, latitude, longitude, resolvedLocation);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The weather service is unavailable.');
    }
  }

  const temperature = value(weather, 'temperature', '24');
  const rain = value(weather, 'rain', '10');
  const wind = value(weather, 'wind', '12');
  const humidity = value(weather, 'humidity', '58');

  return (
    <main className="app-shell">
      <nav className="topbar">
        <a className="brand" href="/" aria-label="WeatherGPT home"><span className="brand-mark"><Sun size={19} /></span> WeatherGPT</a>
        <span className="status"><span className="status-dot" /> Live forecast</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">YOUR WEATHER, CLARIFIED</p>
          <h1>Forecasts that<br /><em>feel human.</em></h1>
          <p className="intro">Ask about any place and get a clear, conversational outlook for your day.</p>
          <form className="search-form" onSubmit={handleSearch}>
            <Search size={20} aria-hidden="true" />
            <div className="search-input-wrap">
              <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedPlace(null); }} placeholder="Search a city or ask about the weather..." aria-label="Search a city or ask about the weather" autoComplete="off" />
              {(suggestionsLoading || suggestions.length > 0) && <div className="suggestions" role="listbox">
                {suggestionsLoading && <div className="suggestion-status">Finding places...</div>}
                {suggestions.map((suggestion) => <button type="button" className="suggestion" key={`${suggestion.latitude}-${suggestion.longitude}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(suggestion.name); setSelectedPlace(suggestion); setSuggestions([]); void loadWeather(suggestion.name, suggestion.latitude, suggestion.longitude, displayLocation(suggestion)); }}>
                  <strong>{suggestion.name}</strong><span>{[suggestion.admin1, suggestion.country].filter(Boolean).join(', ')}</span>
                </button>)}
              </div>}
            </div>
            <button className={`voice-button${listening ? ' listening' : ''}`} type="button" onClick={toggleVoiceInput} aria-label={listening ? 'Stop voice input' : 'Start voice input'} title={listening ? 'Stop voice input' : 'Speak a city'}>
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : 'Ask WeatherGPT'}</button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="sun-orbit" aria-hidden="true"><div className="sun-disc"><Sun size={72} strokeWidth={1.2} /></div></div>
      </section>

      <section className="weather-panel" aria-label="Current weather">
        <div className="panel-heading"><div><p className="eyebrow">CURRENTLY</p><h2><MapPin size={19} /> {location}</h2></div><span className="updated">Updated just now</span></div>
        <div className="current-grid">
          <div className="temperature"><span>{temperature}°</span><p>Mostly sunny</p></div>
          <div className="metrics">
            <Metric icon={<Droplets />} label="Humidity" value={`${humidity}%`} />
            <Metric icon={<Wind />} label="Wind" value={`${wind} km/h`} />
            <Metric icon={<Cloud />} label="Rain chance" value={`${rain}%`} />
          </div>
          <div className="summary"><p>“{message}”</p><span>Good conditions for getting outside.</span></div>
        </div>
      </section>

      <section className="forecast-section"><div className="section-title"><div><p className="eyebrow">THE WEEK AHEAD</p><h2>Plan your days</h2></div><Thermometer size={23} /></div><div className="forecast-grid">{forecastFromWeather(weather).map((item) => <Forecast key={item.day} {...item} />)}</div></section>
      <footer>WeatherGPT <span>•</span> A calmer way to check the sky.</footer>
    </main>
  );
}

function Metric({ icon, label, value: metricValue }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{metricValue}</strong></div></div>;
}

function Forecast({ day, high, low, icon }: ForecastDay) {
  return <article className="forecast-card"><span>{day}</span>{icon === 'sun' ? <Sun className="forecast-icon sun-icon" /> : <Cloud className="forecast-icon" />}<strong>{high}</strong><small>{low}</small></article>;
}

export default App;