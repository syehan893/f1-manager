import {
  Car,
  Gamepad2,
  CalendarCog,
  CalendarDays,
  CircleUser,
  FlaskConical,
  Handshake,
  HardHat,
  History,
  Radio,
  Route,
  Settings,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ViewId } from '@/types';

export type NavGroup = 'GAME' | 'RACE_WEEKEND' | 'CAREER' | 'ACCOUNT';

export interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Second line used in the wide sidebar, like a pit-wall console. */
  sublabel?: string;
}

export const NAV_GROUP_LABEL: Record<NavGroup, string> = {
  GAME: 'Career Game',
  RACE_WEEKEND: 'Race Weekend',
  CAREER: 'Career Mode',
  ACCOUNT: 'Account',
};

export const NAV_ITEMS: NavItem[] = [
  { id: 'game-season', label: 'Season', icon: Gamepad2, group: 'GAME' },

  { id: 'team', label: 'Team', icon: Users, group: 'RACE_WEEKEND' },
  { id: 'drivers', label: 'Drivers', icon: UserRound, group: 'RACE_WEEKEND' },
  { id: 'car-dev', label: 'Car Dev', icon: Car, group: 'RACE_WEEKEND' },
  { id: 'race-strategy', label: 'Race Strategy', icon: Route, group: 'RACE_WEEKEND' },
  { id: 'pitwall', label: 'Pitwall Live', icon: Radio, group: 'RACE_WEEKEND' },

  { id: 'career-season', label: 'Season Setup', icon: CalendarCog, group: 'CAREER' },
  { id: 'career-market', label: 'Driver Market', icon: UsersRound, group: 'CAREER' },
  { id: 'career-rnd', label: 'R&D Center', icon: FlaskConical, group: 'CAREER' },
  { id: 'staff', label: 'Staff', icon: HardHat, group: 'CAREER' },
  { id: 'sponsors', label: 'Sponsors', icon: Handshake, group: 'CAREER' },
  { id: 'career-calendar', label: 'Calendar', icon: CalendarDays, group: 'CAREER' },
  { id: 'history', label: 'History', icon: History, group: 'CAREER' },

  { id: 'settings', label: 'Settings', icon: Settings, group: 'ACCOUNT' },
  { id: 'profile', label: 'Profile', icon: CircleUser, group: 'ACCOUNT' },
];

export const NAV_GROUPS: NavGroup[] = ['GAME', 'RACE_WEEKEND', 'CAREER', 'ACCOUNT'];

export function navItemsFor(group: NavGroup): NavItem[] {
  return NAV_ITEMS.filter((item) => item.group === group);
}

export const CAREER_VIEWS: ViewId[] = navItemsFor('CAREER').map((item) => item.id);

export function isCareerView(view: ViewId): boolean {
  return CAREER_VIEWS.includes(view);
}
