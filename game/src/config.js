// Porto Vela — shared constants: city layout, story, missions, rewards.
// Every number the game balances on lives here, so a tune is one edit.

export const WORLD = {
  blocks: 9, // 9 x 9 city blocks
  pitch: 48, // metres between road centrelines
  road: 14, // road width
  half: 216, // city spans -216 .. +216 on x and z
  beachZ: 252, // sand strip starts past the south edge
  seaZ: 330, // ocean plane edge
  dockX: 252, // docks start past the east edge
  spawn: { x: -24, z: 24 }, // Dante's apartment, block (0,0) corner
  garage: { x: -72, z: 72 }, // M1 garage, west side
  safehouse: { x: 168, z: -168 }, // M3/M8 hideout, north-east
  docks: { x: 232, z: 96 }, // M4 dockside, east piers
  marina: { x: 190, z: 216 }, // marina / beach corner, on the south road
};

export const PALETTE = {
  sky: 0x87b5d6,
  fog: 0x9fc3dd,
  sun: 0xffe3b3,
  asphalt: 0x2e3138,
  roadLine: 0xd8d3c3,
  sidewalk: 0x8f8a80,
  sand: 0xd9b380,
  sea: 0x1f6f8b,
  grass: 0x5d8a4a,
  wall: [0xe8c9a0, 0xd9a06b, 0xc97b5a, 0x9db8c4, 0xe5d9b8, 0xb98a7a, 0x7fa88a, 0xd4b483],
  roof: [0x5a4a3a, 0x6b4a3a, 0x4a5a6b, 0x7a6a4a],
  neon: [0xff5a7a, 0x39d0ff, 0xffd23e, 0x7dff5a],
};

export const RANKS = [
  { missions: 0, name: 'Nobody' },
  { missions: 1, name: 'Wheelman' },
  { missions: 2, name: 'Hustler' },
  { missions: 4, name: 'Shot Caller' },
  { missions: 6, name: 'Kingpin' },
  { missions: 8, name: 'King of Porto Vela' },
];

// The story: Dante Reyes, wheelman back in Porto Vela, owes Mara Voss.
// Det. Rook of the PVPD is closing in. Eight jobs, $19,000 on the table.
export const MISSIONS = [
  {
    id: 1, title: 'First Keys', giver: 'Dante', cash: 1000,
    brief: 'Mara Voss owns your debt. Her garage on Calle Sol holds a car with your name on it. Go get it.',
    steps: [
      { kind: 'reach', at: 'garage', radius: 6, text: 'Reach the garage on Calle Sol' },
      { kind: 'reach', at: 'dropoff1', radius: 7, text: 'Drive the coupe to the paint shop on Avenida Mar' },
    ],
  },
  {
    id: 2, title: 'The Pickup', giver: 'Mara Voss', cash: 1500,
    brief: 'A friend of mine needs a lift from the marina. No questions, no stops, no cops.',
    steps: [
      { kind: 'reach', at: 'marina', radius: 7, text: 'Pick up the passenger at the marina' },
      { kind: 'reach', at: 'dropoff2', radius: 7, text: 'Drop the passenger at the north hotel' },
    ],
  },
  {
    id: 3, title: 'Hot Wheels', giver: 'Dante', cash: 2000,
    brief: 'That pickup was a setup. PVPD has your plate — three stars and climbing. Lose them, then lay low.',
    startStars: 3,
    steps: [
      { kind: 'clear', text: 'Lose the heat — break line of sight and stay clean' },
      { kind: 'reach', at: 'safehouse', radius: 7, text: 'Reach the safehouse on the north-east edge' },
    ],
  },
  {
    id: 4, title: 'Dockside', giver: 'Mara Voss', cash: 2500,
    brief: 'Voss crew is moving product through pier 4 and Rook\'s boys are already there. Four of them. Handle it, then grab the crate.',
    steps: [
      { kind: 'kill', count: 4, at: 'docks', text: 'Take out the four dock guards' },
      { kind: 'reach', at: 'crate', radius: 5, text: 'Grab the crate on pier 4' },
    ],
  },
  {
    id: 5, title: 'Courier Run', giver: 'Mara Voss', cash: 2000,
    brief: 'A package is waiting at the beach kiosk. Walk up and it is yours — then run it to the docks office.',
    steps: [
      { kind: 'pickup', at: 'kiosk', radius: 4, text: 'Pick up the package at the beach kiosk' },
      { kind: 'reach', at: 'docks', radius: 7, text: 'Deliver the package to the docks office' },
    ],
  },
  {
    id: 6, title: 'The Sedan', giver: 'Dante', cash: 2500,
    brief: 'A black sedan with Voss plates is parked by the plaza. Borrow it permanently and bring it to the garage.',
    steps: [
      { kind: 'steal', at: 'plaza', radius: 6, text: 'Steal the black sedan at the plaza' },
      { kind: 'reach', at: 'garage', radius: 7, text: 'Deliver the sedan to the garage' },
    ],
  },
  {
    id: 7, title: 'Van Job', giver: 'Mara Voss', cash: 3000,
    brief: 'A PVPD evidence van is rolling through the market district. Take it — loud is fine, fast is better.',
    steps: [
      { kind: 'steal', at: 'market', radius: 6, text: 'Steal the evidence van in the market district' },
      { kind: 'reach', at: 'dropoff3', radius: 7, text: 'Deliver the van to the south warehouse' },
    ],
  },
  {
    id: 8, title: 'Last Stand', giver: 'Det. Rook', cash: 4500,
    brief: 'Rook has you cornered — four stars, every cruiser in the city. Survive sixty seconds, then vanish.',
    startStars: 4,
    steps: [
      { kind: 'survive', seconds: 60, text: 'Survive the dragnet — 60 seconds' },
      { kind: 'reach', at: 'safehouse', radius: 7, text: 'Slip away to the safehouse' },
    ],
  },
];

export const MISSION_CASH_TOTAL = MISSIONS.reduce((s, m) => s + m.cash, 0); // 19000

// Named places on the map (metres). Roads run on the 48 m grid.
export const PLACES = {
  garage: { x: -72, z: 72 },
  dropoff1: { x: 72, z: -24 },
  marina: { x: 190, z: 216 },
  dropoff2: { x: -24, z: -168 },
  safehouse: { x: 168, z: -168 },
  docks: { x: 232, z: 96 },
  crate: { x: 238, z: 110 },
  kiosk: { x: -96, z: 228 },
  plaza: { x: 24, z: -24 },
  market: { x: -120, z: -72 },
  dropoff3: { x: 120, z: 204 },
};

export const RADIO = [
  { name: 'VELA FM', tag: 'sunset synth', tempo: 112, root: 220.0, wave: 'sawtooth' },
  { name: 'MARINA ROCK', tag: 'harbour guitars', tempo: 140, root: 164.81, wave: 'square' },
  { name: 'BAY TALK', tag: 'talk & static', tempo: 96, root: 261.63, wave: 'triangle' },
];

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 12;

export const SAVE_KEY = 'portovela-save-v1';
