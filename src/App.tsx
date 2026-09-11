import { FormEvent, useState } from 'react';
import { Cloud, Droplets, MapPin, Search, Sun, Thermometer, Wind, LoaderCircle } from 'lucide-react';
import { geocodeCity, sendChat, WeatherData } from './lib/weather-api';

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

function App() {
  const [location, setLocation] = useState('London');
  const [query, setQuery] = useState('');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [message, setMessage] = useState('A bright start with a little cloud later in the day.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const city = query.trim();
    if (!city) return;
    setLoading(true);
    setError('');
    try {
      const coordinates = await geocodeCity(city);
      const result = await sendChat({ message: 'What is the current weather?', lat: coordinates.latitude, lon: coordinates.longitude });
      if (result.intent === 'blocked' || !result.weather_data) {
        throw new Error(result.response || 'The backend did not return weather data');
      }
      setLocation(result.location && result.location !== 'Current Location' ? result.location : coordinates.name);
      setWeather(result.weather_data || null);
      setMessage(result.response || 'Here is the latest forecast.');
      setQuery('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The weather service is unavailable.');
    } finally {
      setLoading(false);
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a city..." aria-label="Search a city" />
            <button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : 'Ask WeatherGPT'}</button>
          </form>
          {error && <p className="error" role="alert">{error}. Start the backend or set <code>VITE_API_URL</code>.</p>}
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