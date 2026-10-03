export const ALL_STATIONS_ID = 'ALL';

// Official CTA / Metra route colors.
export const LINES = {
  red: { name: 'Red', short: 'R', color: '#C60C30' },
  blue: { name: 'Blue', short: 'B', color: '#00A1DE' },
  brown: { name: 'Brown', short: 'Br', color: '#62361B' },
  purple: { name: 'Purple', short: 'P', color: '#522398' },
  yellow: { name: 'Yellow', short: 'Y', color: '#F9E300', darkText: true },
  metra: { name: 'Metra', short: 'M', color: '#005DAA' },
  airport: { name: 'Airport Transit', short: '✈', color: '#565A5C' },
};

export const STATIONS = [
  { id: 'cta-red-howard', name: 'Howard', area: 'Rogers Park', lines: ['red', 'purple', 'yellow'] },
  { id: 'cta-red-jackson', name: 'Jackson', area: 'The Loop', lines: ['red'] },
  { id: 'cta-blue-ohare', name: "O'Hare", area: "O'Hare Airport", lines: ['blue'] },
  { id: 'cta-brown-mart', name: 'Merchandise Mart', area: 'River North', lines: ['brown', 'purple'] },
  { id: 'ord-t1', name: 'Terminal 1', area: "O'Hare Airport", lines: ['airport'] },
  { id: 'metra-union', name: 'Union Station', area: 'West Loop', lines: ['metra'] },
].map((s) => ({
  ...s,
  // Kept for older code paths: the station's main line name and color.
  line: s.lines[0] === 'metra' ? 'Metra' : `CTA ${LINES[s.lines[0]].name} Line`,
  color: LINES[s.lines[0]].color,
}));

export function getStation(id) {
  if (id === ALL_STATIONS_ID) {
    return { id, name: 'All stations', area: 'Every station in the system', lines: [], line: 'System-wide', color: '#000000' };
  }
  return STATIONS.find((s) => s.id === id) ?? { id, name: id, area: '', lines: [], line: 'Unknown', color: '#80868F' };
}

export function stationLabel(id) {
  if (id === ALL_STATIONS_ID) return 'All stations';
  const s = getStation(id);
  const lines = s.lines.map((l) => LINES[l].name);
  return lines.length ? `${s.name} (${lines.join(', ')})` : s.name;
}

export const PRIORITIES = {
  info: {
    label: 'Notice',
    spoken: 'Notice',
    bg: 'bg-alert-info',
    text: 'text-white',
    ring: '#2B4C7E',
    swatch: 'bg-alert-info',
  },
  warning: {
    label: 'Service alert',
    spoken: 'Service alert',
    bg: 'bg-alert-warning',
    text: 'text-black',
    ring: '#E0B400',
    swatch: 'bg-alert-warning',
  },
  critical: {
    label: 'Urgent',
    spoken: 'Urgent alert',
    bg: 'bg-alert-critical',
    text: 'text-white',
    ring: '#C8102E',
    swatch: 'bg-alert-critical',
  },
};

export const QUICK_ALERTS = [
  { label: 'Train delayed 10 minutes', message: 'The next train is delayed by about 10 minutes. We apologize for the inconvenience.', priority: 'warning' },
  { label: 'Platform change to Track 3', message: 'Platform change: the next train will now depart from Track 3.', priority: 'warning' },
  { label: 'Service suspended', message: 'Service is suspended at this station until further notice. Please seek alternate transportation.', priority: 'critical' },
  { label: 'Final boarding call', message: 'Final boarding call. Doors are closing. Please board now or wait for the next train.', priority: 'warning' },
  { label: 'Elevator out of service', message: 'The station elevator is out of service. The nearest accessible station is listed on the platform display.', priority: 'info' },
  { label: 'Shuttle buses outside', message: 'Shuttle buses are available outside the main entrance to replace rail service.', priority: 'info' },
  { label: 'Evacuate the station', message: 'Emergency. Please leave the station calmly using the nearest exit and follow staff instructions.', priority: 'critical' },
  { label: 'Service resumed', message: 'Normal service has resumed. Thank you for your patience.', priority: 'info' },
];

// What gets read aloud. Shared by the browser voice and the relay's AI voice
// so both say exactly the same thing.
export function spokenText(alert) {
  const p = PRIORITIES[alert.priority] ?? PRIORITIES.info;
  const where = alert.stationId === ALL_STATIONS_ID ? 'All stations' : `${getStation(alert.stationId).name} station`;
  return `${p.spoken}. ${where}. ${alert.message}`;
}

// Fixed phrases the AI voice can say (generated once, then cached).
export const PHRASES = {
  greeting: 'Live alerts are on. You will hear new announcements for this station.',
  sample: 'Attention please. The next train to Howard will depart from Track 3.',
};
