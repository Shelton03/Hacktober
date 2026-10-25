import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Shapes per icon (24×24, stroke-based, Lucide-style).
 *  'c:cx cy r' → circle, 'r:x y w h rx' → rect, anything else → path d. */
const ICONS: Record<string, string[]> = {
  dashboard: ['r:3 3 7 9 1', 'r:14 3 7 5 1', 'r:14 12 7 9 1', 'r:3 16 7 5 1'],
  cart: [
    'c:8 21 1',
    'c:19 21 1',
    'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12',
  ],
  invoice: [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
    'M14 2v4a2 2 0 0 0 2 2h4',
    'M10 9H8',
    'M16 13H8',
    'M16 17H8',
  ],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'c:9 7 4',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'c:12 7 4'],
  package: [
    'M16.5 9.4 7.55 4.24',
    'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    'M3.29 7 12 12l8.71-5',
    'M12 22V12',
  ],
  receipt: [
    'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z',
    'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8',
    'M12 17.5v-11',
  ],
  chart: ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  pie: ['M21.21 15.89A10 10 0 1 1 8 2.83', 'M22 12A10 10 0 0 0 12 2v10z'],
  target: ['c:12 12 10', 'c:12 12 6', 'c:12 12 2'],
  sparkles: [
    'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z',
    'M5 3v4',
    'M19 17v4',
    'M3 5h4',
    'M17 19h4',
  ],
  shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  landmark: ['M3 22h18', 'M6 18v-7', 'M10 18v-7', 'M14 18v-7', 'M18 18v-7', 'M12 2 20 7H4z'],
  printer: [
    'M6 9V2h12v7',
    'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'r:6 14 12 8 0',
  ],
  lock: ['r:3 11 18 11 2', 'M7 11V7a5 5 0 0 1 10 0v4'],
  banknote: ['r:2 6 20 12 2', 'c:12 12 2', 'M6 12h.01M18 12h.01'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  sliders: [
    'M4 21v-7',
    'M4 10V3',
    'M12 21v-9',
    'M12 8V3',
    'M20 21v-5',
    'M20 12V3',
    'M2 14h4',
    'M10 8h4',
    'M18 16h4',
  ],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  search: ['c:11 11 8', 'm21 21-4.3-4.3'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevrons-ud': ['m7 15 5 5 5-5', 'm7 9 5-5 5 5'],
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  'arrow-left': ['M19 12H5', 'm12 19-7-7 7-7'],
  'trending-up': ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7h6v6'],
  'trending-down': ['M22 17 13.5 8.5 8.5 13.5 2 7', 'M16 17h6v-6'],
  check: ['M20 6 9 17l-5-5'],
  'check-circle': ['c:12 12 10', 'm9 12 2 2 4-4'],
  alert: [
    'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
    'M12 9v4',
    'M12 17h.01',
  ],
  info: ['c:12 12 10', 'M12 16v-4', 'M12 8h.01'],
  'alert-circle': ['c:12 12 10', 'M12 8v4', 'M12 16h.01'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  sun: [
    'c:12 12 4',
    'M12 2v2',
    'M12 20v2',
    'm4.93 4.93 1.41 1.41',
    'm17.66 17.66 1.41 1.41',
    'M2 12h2',
    'M20 12h2',
    'm6.34 17.66-1.41 1.41',
    'm19.07 4.93-1.41 1.41',
  ],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  monitor: ['r:2 3 20 14 2', 'M8 21h8', 'M12 17v4'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
  whatsapp: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'],
  trash: [
    'M3 6h18',
    'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
    'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
  ],
  pencil: [
    'M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z',
    'm15 5 4 4',
  ],
  eye: [
    'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0',
    'c:12 12 3',
  ],
  refresh: [
    'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
    'M21 3v5h-5',
    'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
    'M8 16H3v5',
  ],
  calendar: ['r:3 4 18 18 2', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  wallet: [
    'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
    'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  ],
  store: ['M4 10v10h16V10', 'M2 10 4 4h16l2 6Z', 'M9 20v-5h6v5'],
  briefcase: ['r:2 7 20 14 2', 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'],
  card: ['r:2 5 20 14 2', 'M2 10h20'],
  phone: ['r:5 2 14 20 2', 'M12 18h.01'],
  clock: ['c:12 12 10', 'M12 6v6l4 2'],
  mail: ['r:2 4 20 16 2', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  qr: [
    'r:3 3 5 5 1',
    'r:16 3 5 5 1',
    'r:3 16 5 5 1',
    'M21 16h-3a2 2 0 0 0-2 2v3',
    'M21 21v.01',
    'M12 7v3a2 2 0 0 1-2 2H7',
    'M3 12h.01',
    'M12 3h.01',
    'M12 16v.01',
    'M16 12h1',
    'M21 12v.01',
    'M12 21v-1',
  ],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  zap: [
    'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  ],
  grip: ['c:9 5 1', 'c:9 12 1', 'c:9 19 1', 'c:15 5 1', 'c:15 12 1', 'c:15 19 1'],
  more: ['c:5 12 1', 'c:12 12 1', 'c:19 12 1'],
  truck: [
    'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2',
    'M15 18H9',
    'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14',
    'c:17 18 2',
    'c:7 18 2',
  ],
  upload: ['M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2', 'M12 12v9', 'm16 16-4-4-4 4'],
  power: ['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.77.04'],
  percent: ['M19 5 5 19', 'c:6.5 6.5 2.5', 'c:17.5 17.5 2.5'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  star: [
    'M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2.1 2.1 0 0 0 1.6 1.2l5.2.7a.5.5 0 0 1 .3.9l-3.8 3.7a2.1 2.1 0 0 0-.6 1.9l.9 5.1a.5.5 0 0 1-.8.6l-4.6-2.4a2.1 2.1 0 0 0-2 0L6.4 21a.5.5 0 0 1-.8-.6l.9-5.1a2.1 2.1 0 0 0-.6-1.9L2.2 9.8a.5.5 0 0 1 .3-.9l5.1-.7a2.1 2.1 0 0 0 1.6-1.2z',
  ],
};

type Shape =
  | { t: 'p'; d: string }
  | { t: 'c'; cx: string; cy: string; r: string }
  | { t: 'r'; x: string; y: string; w: string; h: string; rx: string };

function parse(spec: string): Shape {
  if (spec.startsWith('c:')) {
    const [cx, cy, r] = spec.slice(2).split(' ');
    return { t: 'c', cx, cy, r };
  }
  if (spec.startsWith('r:')) {
    const [x, y, w, h, rx] = spec.slice(2).split(' ');
    return { t: 'r', x, y, w, h, rx };
  }
  return { t: 'p', d: spec };
}

const CACHE = new Map<string, Shape[]>();

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-flex;flex:none;line-height:0', 'aria-hidden': 'true' },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="stroke()"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      @for (s of shapes(); track $index) {
        @switch (s.t) {
          @case ('c') {
            <circle [attr.cx]="$any(s).cx" [attr.cy]="$any(s).cy" [attr.r]="$any(s).r" />
          }
          @case ('r') {
            <rect
              [attr.x]="$any(s).x"
              [attr.y]="$any(s).y"
              [attr.width]="$any(s).w"
              [attr.height]="$any(s).h"
              [attr.rx]="$any(s).rx"
            />
          }
          @default {
            <path [attr.d]="$any(s).d" />
          }
        }
      }
    </svg>
  `,
})
export class IconComponent {
  name = input.required<string>();
  size = input<number>(18);
  stroke = input<number>(2);

  shapes = computed(() => {
    const n = this.name();
    let s = CACHE.get(n);
    if (!s) {
      s = (ICONS[n] ?? ICONS['info']).map(parse);
      CACHE.set(n, s);
    }
    return s;
  });
}
