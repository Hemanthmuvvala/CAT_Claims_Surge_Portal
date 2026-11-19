// Synthetic seed data for the demo. All data is fictional. Timestamps are
// generated relative to "now" so the demo always looks live.

import {
  SEVERITY,
  EVENT_STATUS,
  ADJUSTER_STATUS,
} from "../constants.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

export const DEMO_POLICYHOLDER = {
  id: "ph-demo-1",
  name: "Priya Raman",
  email: "priya.raman@example.com",
  policyId: "POL-77341-A",
};

export const DEMO_EVENTS = [
  {
    id: "evt-varuna",
    name: "Cyclone Hudhud",
    type: "Tropical cyclone",
    region: "Visakhapatnam — Coastal Andhra Pradesh",
    declaredAt: ago(52 * HOUR),
    status: EVENT_STATUS.ACTIVE,
    summary: "Severe cyclonic storm made landfall near Visakhapatnam. Widespread wind and storm-surge damage across coastal mandals.",
  },
  {
    id: "evt-arnab",
    name: "Cyclone Arnab",
    type: "Tropical cyclone",
    region: "Nellore — Coastal Andhra Pradesh",
    declaredAt: ago(26 * HOUR),
    status: EVENT_STATUS.MONITORING,
    summary: "Cyclonic storm tracking along the Nellore coast. Landfall expected within 36 hours — claims intake standing by.",
  },
  {
    id: "evt-murasu",
    name: "Cyclone Murasu",
    type: "Tropical cyclone",
    region: "Kakinada — Coastal Andhra Pradesh",
    declaredAt: ago(12 * 24 * HOUR),
    status: EVENT_STATUS.CLOSED,
    summary: "Weakened and exited land. Claims intake closed; residual assessments continue.",
  },
  {
    id: "evt-riverside",
    name: "Hyderabad Urban Flooding",
    type: "Urban flood",
    region: "Khairatabad — Hyderabad, Telangana",
    declaredAt: ago(20 * HOUR),
    status: EVENT_STATUS.ACTIVE,
    summary: "Overnight cloudburst overwhelmed storm-water drains in low-lying Hyderabad localities; Musi backwater flooded ground floors.",
  },
  {
    id: "evt-northern",
    name: "Ananthagiri Hills Wildfire",
    type: "Wildfire",
    region: "Ananthagiri Hills — Vikarabad, Telangana",
    declaredAt: ago(9 * 24 * HOUR),
    status: EVENT_STATUS.CLOSED,
    summary: "Summer scrub fire spread along the forest fringe. Isolated outbuildings affected; containment reached.",
  },
];

export const DEMO_ADJUSTERS = [
  { id: "adj-1", name: "Marcus Chen", capacity: 14, status: ADJUSTER_STATUS.AVAILABLE, region: "Visakhapatnam — Sagar Nagar", phone: "555-0141" },
  { id: "adj-2", name: "Elena Rodriguez", capacity: 12, status: ADJUSTER_STATUS.AVAILABLE, region: "Visakhapatnam — Akkayyapalem", phone: "555-0142" },
  { id: "adj-3", name: "David Okafor", capacity: 10, status: ADJUSTER_STATUS.NEAR_CAPACITY, region: "Hyderabad — Khairatabad", phone: "555-0143" },
  { id: "adj-4", name: "Sarah Whitfield", capacity: 12, status: ADJUSTER_STATUS.OVERLOADED, region: "Hyderabad — Somajiguda", phone: "555-0144" },
  { id: "adj-5", name: "James Park", capacity: 10, status: ADJUSTER_STATUS.AVAILABLE, region: "Vikarabad — Ananthagiri", phone: "555-0145" },
  { id: "adj-6", name: "Aisha Bello", capacity: 8, status: ADJUSTER_STATUS.UNAVAILABLE, region: "On leave", phone: "555-0146" },
];

const HARDSHIP = {
  ELDERLY: "Elderly resident",
  MEDICAL: "Medical needs",
  NO_POWER: "No power / water",
  DISPLACED: "Displaced from home",
  CHILDREN: "Young children",
  LIVELIHOOD: "Livelihood at risk",
};

export const DEMO_CLAIMS = [];
export const DEMO_CLUSTERS = [];
export function buildInitialActivity() {
  return [];
}

export const DEMO_NOTIFICATIONS = [];

export const HARDSHIP_OPTIONS = Object.values(HARDSHIP);

export const SEVERITY_HELP = {
  [SEVERITY.CRITICAL]: "Property unsafe or uninhabitable, or someone is at risk.",
  [SEVERITY.HIGH]: "Major damage affecting daily living (e.g. water inside the home).",
  [SEVERITY.MEDIUM]: "Significant damage but the home is still safe to live in.",
  [SEVERITY.LOW]: "Minor or cosmetic damage only.",
};
