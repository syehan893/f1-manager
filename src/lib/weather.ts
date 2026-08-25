import { Cloud, CloudRain, CloudLightning, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WeatherKind } from '@/types';

export const WEATHER_ICON: Record<WeatherKind, LucideIcon> = {
  DRY: Sun,
  CLOUDY: Cloud,
  LIGHT_RAIN: CloudRain,
  HEAVY_RAIN: CloudLightning,
};

export const WEATHER_TONE: Record<WeatherKind, string> = {
  DRY: 'text-neon-amber',
  CLOUDY: 'text-chrome-400',
  LIGHT_RAIN: 'text-neon-blue',
  HEAVY_RAIN: 'text-neon-blue',
};

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  DRY: 'Dry',
  CLOUDY: 'Cloudy',
  LIGHT_RAIN: 'Light rain',
  HEAVY_RAIN: 'Heavy rain',
};
