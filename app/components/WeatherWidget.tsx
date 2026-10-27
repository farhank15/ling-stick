import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, type LucideIcon } from 'lucide-react';

type WeatherData = {
  temperature_2m: number;
  weather_code: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
};

type Props = {
  weather: WeatherData | null;
};

function describe(code: number): { label: string; Icon: LucideIcon } {
  if (code === 0) return { label: 'Cerah', Icon: Sun };
  if (code === 1 || code === 2) return { label: 'Cerah berawan', Icon: CloudSun };
  if (code === 3) return { label: 'Berawan', Icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Berkabut', Icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: 'Gerimis', Icon: CloudDrizzle };
  if (code >= 61 && code <= 67) return { label: 'Hujan', Icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: 'Salju', Icon: CloudSnow };
  if (code >= 80 && code <= 82) return { label: 'Hujan sebentar', Icon: CloudRain };
  if (code >= 85 && code <= 86) return { label: 'Salju', Icon: CloudSnow };
  if (code >= 95) return { label: 'Badai petir', Icon: CloudLightning };
  return { label: 'Cuaca', Icon: Cloud };
}

export function WeatherWidget({ weather }: Props) {
  if (!weather) {
    return (
      <div className='card flex flex-col gap-2 p-4'>
        <p className='label'>Cuaca · Sleman</p>
        <p className='text-sm text-zinc-400'>Data cuaca sedang tidak tersedia.</p>
      </div>
    );
  }

  const { label, Icon } = describe(weather.weather_code);
  const hum = typeof weather.relative_humidity_2m === 'number' ? Math.round(weather.relative_humidity_2m) : null;
  const wind = typeof weather.wind_speed_10m === 'number' ? Math.round(weather.wind_speed_10m) : null;

  return (
    <div className='card flex flex-col gap-2 p-4'>
      <p className='label'>Cuaca · Sleman</p>
      <div className='flex items-center gap-3'>
        <Icon className='h-9 w-9 text-teal-600 dark:text-teal-400' />
        <div className='min-w-0'>
          <p className='text-2xl font-bold leading-none'>{Math.round(weather.temperature_2m)}°C</p>
          <p className='mt-1 text-sm text-muted'>{label}</p>
        </div>
      </div>
      {(hum !== null || wind !== null) && (
        <p className='text-[11px] text-zinc-400'>
          {hum !== null ? `Kelembapan ${hum}%` : ''}
          {hum !== null && wind !== null ? ' · ' : ''}
          {wind !== null ? `Angin ${wind} km/jam` : ''}
        </p>
      )}
    </div>
  );
}
