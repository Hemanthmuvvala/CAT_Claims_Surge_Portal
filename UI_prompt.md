# Design a Premium Enterprise Insurance Web Application — CAT Claims Surge Portal

## 1. Your role

Act as a principal product designer and enterprise UX architect with 20 years of experience designing insurance, financial-services and mission-critical operational platforms.

Design a polished, production-quality frontend for **INS-04 — CAT Claims Surge Portal**. This platform helps insurance catastrophe-response teams process sudden surges of claims caused by hurricanes, floods and wildfires.

The application must feel trustworthy, calm under pressure, highly usable, data-rich without being cluttered, and credible enough for an enterprise insurance demonstration.

Do not create a generic admin template, a marketing website, or a chatbot interface. Design a complete operational product with connected screens, reusable components, realistic synthetic data and meaningful interactions.

## 2. Product objectives

The application must enable users to:

1. Register and select a declared catastrophe (CAT) event.
2. Ingest and monitor a large batch of claims.
3. Prioritise high-severity and hardship/vulnerability cases with explainable AI-assisted scoring.
4. Group related claims by location and peril.
5. Distribute work according to adjuster capacity.
6. Monitor throughput, queue health, urgent-claim SLA performance, AI fallback and cost per claim.
7. Give policyholders a clear, plain-language claim status and next step.
8. Remain understandable and usable when the AI provider is slow or unavailable.

The MVP is a triage and operational coordination tool. It does not process payments, schedule field inspections or make final autonomous coverage decisions.

## 3. Design system and visual identity

Create an elegant enterprise insurance design system with consistent spacing, typography, grids, components and interaction states.

### Colour palette

- Primary navy: `#17365D` — navigation, headings and trust.
- Secondary blue: `#1F4E79` — secondary emphasis and selected navigation.
- Action teal: `#0F766E` — primary actions, links and positive operational indicators.
- Main canvas: `#F4F7FA` — subtle application background.
- Surface: `#FFFFFF` — cards, tables, dialogs and content areas.
- Main text: `#202A35`.
- Secondary text: `#5B6573`.
- Border: `#D9E1E8`.
- Warning amber: `#D97706`.
- Critical red: `#B42318`.
- Success green: `#28734B`.

Use navy and white as the foundation, teal sparingly for actions, amber for warnings and red only for genuine critical conditions. Do not use excessive gradients, glassmorphism, neon colours, oversized rounded cards or decorative animations.

### Typography

Use Inter or a comparable modern sans-serif font.

- Page headings: 24–30 px.
- Section headings: 16–20 px.
- Body text: 14–16 px.
- Table content: comfortably readable, around 13–14 px.
- KPI values: 26–34 px, with a clear label and context.
- Metadata and timestamps: 12–13 px.

Maintain clear hierarchy, adequate whitespace and predictable alignment.

### Layout principles

- Desktop-first, designed for a 1440 px-wide command-centre monitor.
- Responsive at tablet and mobile widths.
- Use a 12-column content grid where appropriate.
- Prefer a 240–256 px left navigation sidebar, a compact top bar and a flexible content area.
- Use an 8 px spacing system, consistent card padding, restrained shadows and subtle borders.
- Use 8–12 px corner radii for most components.
- Avoid excessive cards inside cards.
- Use sticky table headers where helpful and keep important controls visible.
- Provide keyboard focus states, accessible contrast, clear labels and icons paired with text when needed.
- Do not rely on colour alone to communicate severity or status.

## 4. Application shell, three user roles and navigation

The product must support three distinct user roles and role-appropriate experiences:

1. **Policyholder / Claimant** — submits a claim and tracks only their own claim(s).
2. **Catastrophe Response Manager** — monitors all claims for authorised events, reviews AI-assisted triage, manages clusters and assigns claims.
3. **Adjuster / Surge Team** — sees assigned claims, understands the priority explanation and updates permitted operational statuses.

Use a separate policyholder access experience and one shared internal login for CAT managers and adjusters. After authentication, route each role to its own home screen. For a frontend prototype, provide clearly labelled demo accounts or a development-only role selector; do not present a demo role switcher as production authentication. The backend must later enforce permissions regardless of what navigation the frontend displays.

Create a consistent shell for all operational screens.

### Left sidebar

At the top, show a refined brand mark and the product name:

**CAT RESPONSE**
Claims Surge Portal

For the CAT Response Manager, show a small “OPERATIONS” section with these navigation items in this order:

1. Overview
2. Priority Queue
3. Claim Clusters
4. Adjuster Workload
5. CAT Events
6. Bulk Claim Intake

For the Adjuster / Surge Team, show role-appropriate navigation:

1. My Work Queue
2. Claim Details / Assigned Work
3. Cluster Context
4. Workload Summary

For the Policyholder portal, use a simplified separate navigation:

1. Submit a Claim
2. My Claims
3. Claim Status

Do not show internal operational navigation to policyholders. Do not show manager-only controls to adjusters unless explicitly authorised. Keep the brand identity consistent across all roles.

At the bottom of the internal sidebar, include a compact signed-in user panel showing a realistic synthetic user name, current role, avatar and dropdown chevron. The displayed navigation and available actions must match the active role. The policyholder portal should use a simpler profile/sign-out area.

Use a clear selected state with a pale blue/teal background and a left accent indicator. Keep icons consistent, simple and professional. Use a collapsible sidebar for smaller screens.

### Top navigation bar

Include:

- Breadcrumbs.
- Active catastrophe event selector, such as “Cyclone Varuna — Coastal Region”.
- Event status badge.
- Global claim search.
- Notification bell with unread count.
- Help icon.
- User avatar and dropdown menu.

The profile dropdown should contain Profile, Preferences, Help and Sign out. Do not invent non-functional settings pages; unsupported items can be clearly labelled as future functionality.

### Global event selector

When an event is selected, operational pages should display data scoped to that event. The selector should show event name, peril/type, region and current status.

Provide a clear “Declare CAT Event” primary action for authorised managers. Open a well-designed modal or dedicated form with event name, event type, region, declared-at timestamp and validation messages.

## 5. Screen 1 — CAT Command Dashboard

This is the primary landing page. It must answer three questions immediately:

- How many claims have arrived?
- Which urgent claims are waiting for human attention?
- Is the operation processing claims efficiently?

### Header

Display:

“CAT Command Centre”

Supporting text: “Monitor catastrophe intake, triage performance and response capacity.”

Include the active event selector, a time-window filter and a primary “Import Claims” action. Include “Declare CAT Event” if the user is authorised.

### KPI row

Create five compact, aligned KPI cards:

1. Total Claims Received
2. Claims Triaged
3. Pending Claims
4. Urgent Claims Awaiting Review
5. Claims Triaged per Minute

Each KPI must include a clear label, value, small contextual indicator and optional comparison with the previous time window. Do not invent misleading percentage changes; use realistic synthetic values with a “Demo data” label.

### Operational analytics

Use a balanced two-column layout.

Left:
- Claims intake and triage throughput over time, displayed as a clean line or area chart.
- Queue health with pending, in-progress and completed counts.
- A visible indicator for urgent claims beyond the configured response target.

Right:
- Adjuster workload distribution using horizontal progress bars.
- Current capacity and utilisation.
- A concise operational alerts panel.

### AI operations and cost

Include a compact, clearly labelled “AI Processing Health” panel containing:

- Average or median triage latency.
- Fallback rate.
- Model status: Operational, Degraded or Unavailable.
- Total processing cost.
- Cost per claim.
- Last updated timestamp.

When the model is degraded, show an amber notice explaining that rules-based fallback scoring is active. The dashboard must never imply the model is healthy when fallback is being used.

### Recent activity

Display a compact activity table with time, claim/event, action, status and actor/system source.

Use restrained status badges and useful links to open the associated claim.

## 6. Screen 2 — Priority Queue

Design a powerful, enterprise-grade claim triage workspace.

### Page header

Title: “Priority Queue”

Description: “Review claims in recommended triage order and understand the factors behind each priority score.”

Display total claims, urgent claims awaiting assignment and the number using fallback scoring.

### Search and filters

Include:

- Search by claim reference.
- Filter by severity.
- Filter by hardship/vulnerability indicator.
- Filter by status.
- Filter by priority-score range.
- Filter by assigned/unassigned.
- Filter by AI-scored/rules-fallback.
- Sort by priority, severity, arrival time or score.

Provide clear filter chips, a reset-filters action and a visible result count.

### Claims table

Use a clean, dense but readable table with sticky headers.

Columns:

- Claim reference.
- Location.
- Peril or damage type.
- Severity.
- Hardship indicator.
- Priority score.
- Main priority factors.
- Current status.
- Assigned adjuster.
- Received time.
- Actions.

Use realistic synthetic data and varied statuses. Make the priority score visually prominent without turning the entire row red.

Include semantic urgency labels such as Critical, High, Medium and Routine, with distinct text and accessible colour treatments.

Provide pagination or controlled virtualisation if needed. Avoid rendering hundreds of rows in a way that blocks the interface.

### Claim details drawer

When a row is selected, open a right-side drawer rather than navigating away.

Include:

- Claim reference and status.
- Location and catastrophe event.
- Severity and hardship signals.
- Priority score and the main contributing factors.
- A short, plain-language explanation of why the claim is prioritised.
- Retrieved policy evidence with source/document references, where available.
- Current adjuster and assignment status.
- Processing method: AI-assisted or rules-based fallback.
- Processing timestamp and latency.
- Available actions: view details, assign/reassign if authorised, and mark for human review.

Clearly distinguish triage urgency from coverage eligibility. Show “Coverage decision requires authorised review” where applicable. If policy evidence is missing, say so instead of inventing an answer.

## 7. Screen 3 — Claim Clusters

Title: “Claim Clusters”

Description: “Group related claims by location and peril to coordinate catastrophe response.”

### Layout

Use a split view with a geographic map on the left and a cluster list on the right. If a usable map component is unavailable, create a clean, credible map placeholder with labelled locations and pins rather than a decorative image pretending to be interactive.

Include a map/list toggle for users who prefer a tabular view.

### Map and controls

Include:

- Active event and region.
- Location/peril filters.
- Cluster markers labelled with claim counts.
- A legend.
- Fit-to-event or reset-view control.
- A clear unclustered-claims indicator.

Use accessible markers and distinguish clusters by meaningful categories without relying only on colour.

### Cluster list

Each cluster row or card must display:

- Cluster name or location key.
- Peril/damage category.
- Number of related claims.
- Highest priority represented in the cluster.
- Number of unassigned claims.
- Cluster processing status.

### Cluster detail panel

On selection, show cluster summary, member claims, location, relevant event context and assignment overview.

Allow navigation from a cluster to its claims in the Priority Queue.

Do not imply that clustering itself proves a common cause or establishes coverage. Display a suitable “Related by location/peril” description.

## 8. Screen 4 — Adjuster Workload

Title: “Adjuster Workload”

Description: “Balance claim assignments against team capacity and protect response quality during surge conditions.”

### Summary row

Display:

- Total adjusters.
- Available adjusters.
- Total active workload.
- Unassigned claims.
- Maximum workload deviation above the team mean.

If the agreed maximum deviation threshold is not configured, display “Threshold not configured” instead of inventing an approved SLA.

### Workload visualisation

Use horizontal progress bars for each adjuster. Each row must include:

- Avatar or initials.
- Adjuster name.
- Current status.
- Active assigned claims.
- Configured capacity.
- Utilisation percentage.
- Difference from the team’s mean workload.
- An accessible workload status label.

Use teal for normal workload, amber for near-capacity and red for actual overload. Make the capacity limit explicit.

### Assignment table

Display claim reference, priority, cluster, assigned adjuster, assignment time and status.

Provide filters for overloaded, available, unassigned and urgent claims.

Include an “Assignment Preview” or “Balance Workload” interaction that shows proposed assignments before applying them. If the assignment engine is unavailable, show a disabled action with a clear explanation rather than pretending it works.

The system must not assign claims to an unavailable or full adjuster. Make unassigned urgent claims visible.

Do not implement automatic offline-adjuster reassignment as a core feature; that is a stretch goal.

## 9. Screen 5 — Policyholder Claim Status Tracker

Create a distinct, reassuring and accessible policyholder-facing experience. Do not simply reuse the internal operations dashboard.

Use a simplified layout with the same brand identity, less operational density and minimal navigation.

### Header

Show the brand, a “Track your claim” heading, a help/contact entry point and an appropriate sign-out or return link where applicable.

### Claim lookup and security

Provide a secure claim-access flow appropriate to the prototype. Do not expose claim details based only on a guessable reference number.

Show useful validation, unauthorised, not-found and loading states.

### Claim status card

Display:

- Claim reference.
- Current status in plain language.
- Date last updated.
- Catastrophe event context where appropriate.
- Assigned contact or team, only if available and authorised.

### Progress timeline

Create a clear timeline with stages such as:

1. Claim received.
2. Initial review.
3. Assigned for assessment.
4. Review in progress.
5. Next step / further information required, where applicable.

Clearly differentiate completed, current and upcoming stages. Do not imply that every claim follows the same timeline if its actual status differs.

### Next-step panel

Show a prominent card:

“What happens next?”

Include a simple, relevant next step and any action the policyholder needs to take. If no action is required, state that clearly.

Use calm, empathetic language. Do not expose internal AI scores, other claimants’ information or internal operational notes.

## 10. Cross-screen interactions

Design the screens as one connected product, not separate visual mockups.

- Selecting a CAT event updates event-scoped information across the operational screens.
- Selecting an urgent KPI opens the Priority Queue with the appropriate filters applied.
- Clicking a claim reference opens the claim details drawer.
- Clicking a cluster opens its member claims.
- Clicking an adjuster opens their workload and assigned claims.
- Importing claims shows upload progress, processing state and a completion/error summary.
- Model degradation displays a visible but non-blocking status banner.
- A failed operation provides a recovery action and clear explanation.
- Table sorting, search, filters, tabs, dropdowns and drawers must behave consistently.
- Provide a coherent breadcrumb hierarchy.
- Preserve the user's place in the queue when a drawer is closed.

Use realistic synthetic data to demonstrate these interactions. Do not use real policyholder personal data.

## 11. Mandatory states and resilience UX

Design explicit states for:

- Initial loading.
- Empty dashboard or no active event.
- No search results.
- Batch upload in progress.
- Batch upload complete.
- Partial batch validation errors.
- Claim scoring in progress.
- AI provider rate-limited.
- Rules-based fallback active.
- AI service unavailable.
- Assignment blocked by capacity.
- Missing policy evidence.
- No adjusters available.
- Claim not found or access denied.
- API/network error with retry.
- Success confirmation.
- SLA target not configured.

For large batch intake, use asynchronous progress indicators and clear processing summaries. Never block the entire interface while hundreds of claims are being processed.

Make degraded operation explicit without frightening the user unnecessarily.

## 12. Component library

Create reusable components for:

- Sidebar and top navigation.
- Breadcrumbs and page headers.
- Event selector.
- KPI cards.
- Charts and metric summaries.
- Search bars and filter toolbars.
- Data tables and pagination.
- Priority and status badges.
- Progress bars and workload indicators.
- Claim detail drawer.
- Cluster detail panel.
- Confirmation dialogs.
- Toast notifications.
- Loading skeletons.
- Empty states.
- Error states.
- Degraded-AI banners.
- Form fields and validation messages.
- Profile menu.

Maintain consistent component sizing, interaction states, keyboard focus, spacing and visual hierarchy throughout the application.

## 13. UX and accessibility requirements

Apply these principles:

- Visibility of system status.
- Match the interface to the language of insurance operations.
- Consistency and standards.
- Recognition rather than recall.
- Error prevention and recovery.
- Progressive disclosure for complex claim information.
- Clear information hierarchy.
- Minimal cognitive load during emergency operations.
- WCAG AA-level contrast as the design target.
- Keyboard-accessible controls and visible focus states.
- Meaningful labels for charts, icons and status badges.
- Responsive tables that become usable stacked layouts or controlled horizontal scrolling on small screens.
- No colour-only status communication.
- No decorative animations that delay operational work.

## 14. Prototype content and visual quality

Use credible synthetic content such as:

- “Cyclone Varuna — Coastal Region”.
- “Flooding — Riverside District”.
- Claims with varied severity and vulnerability signals.
- Multiple adjusters with different capacity levels.
- Mixed processing statuses, including rules-based fallback.
- Realistic timestamps, counts and cost values clearly marked as demo data.

Use a consistent icon family such as Lucide. Use simple, professional charts with labelled axes, sensible scales and tooltips.

Avoid lorem ipsum, generic stock photos, excessive gradients, giant hero sections, oversized rounded cards, fake AI chat bubbles and unnecessary decorative illustrations.

The overall experience should resemble a premium enterprise insurance operations platform built for speed, clarity, accountability and trust.

## 14A. Required role workflow and end-to-end claim lifecycle

This section adds missing functional requirements while preserving the five original screen designs.

### Policyholder claim submission
- The policyholder must be able to sign in or use the designed secure claim-access flow, open “Submit a Claim”, enter incident/claim details, validate the form, submit it, and receive a unique claim reference.
- Include incident type/peril, event if known, incident date, location, description of loss, severity indicators, relevant hardship/support needs, policy reference and optional supporting-document references. Keep the form understandable and avoid collecting unnecessary personal data.
- After submission, show a confirmation page and add the claim to the policyholder's “My Claims” list.
- The policyholder must only be able to view their own claims. A claim reference alone must not be treated as sufficient production authentication.

### New claim appears for the CAT manager
- After a successful mock submission, the new claim must appear in the CAT manager's Priority Queue and update the relevant demo dashboard counts.
- Show its initial state as “Submitted” or “Triage pending”; do not show a made-up AI result before triage has run.
- Provide a visible processing state while triage is pending. For this frontend prototype, simulate the transition with mock services/state; do not claim that a real AI model is connected.
- When the mock triage completes, show a bounded priority score, structured factors, scoring method, evidence state/source references when available, and whether human review is required.
- Include distinct states for AI-assisted result, rules-based fallback, insufficient/conflicting evidence, processing failure and retry. Keep the score labelled as triage support, never as claim approval or denial.
- The manager can inspect the result and assign the claim to an eligible adjuster. Full/unavailable adjusters must be disabled in the assignment selector.

### Adjuster workflow
- Once assigned, the claim appears in that adjuster's “My Work Queue”.
- The adjuster can open the claim, review the score explanation, evidence references, cluster context and assignment details, then update only the operational statuses they are allowed to change.
- The status update should appear in the manager's queue and in the policyholder's claimant-safe status/timeline.
- Keep internal notes, score factors and internal-only information hidden from policyholders.

### Shared domain concepts and future integration
Keep mock records compatible with the existing project data-model concepts:
- Event: id, type, region, declaredAt.
- Claim: id, eventId, policyId, severity, priorityScore, status.
- Cluster: eventId, key, claimIds (use a junction relationship in the eventual relational database rather than relying only on an array).
- PriorityScore: claimId, value, factors (support score history and scoring method in the backend).
- Resource/Adjuster: id, capacity, load.
- Assignment: claimId, adjusterId, assignedAt (retain assignment history in the backend).

Keep fixture data and data access separate from screen components. Use stable IDs and shared typed models/status constants. Make the frontend service layer replaceable with Node/Express API calls later. The Python FastAPI AI service will be integrated through the backend, never called directly by the browser.

The proposed AI result shown by the prototype should be treated as a mock contract only. Suggested fields are `claimId`, `score`, `factors`, `coverageEvidence`, `evidenceState`, `scoringMethod`, `needsHumanReview`, `processedAt` and `warnings`. Do not imply this schema is already final or that the real AI service exists.

## 15. Deliverables

Keep the original five operational screens as the visual foundation, and extend the prototype with the missing role-based claim workflow. Generate the complete responsive application experience.

### Original core screens — preserve their design intent
1. CAT Command Dashboard.
2. Priority Queue and claim-detail drawer.
3. Claim Clusters with map/list and cluster detail.
4. Adjuster Workload and assignment preview.
5. Policyholder Claim Status Tracker.

### Add these missing screens and flows
6. Role-appropriate login/access experience for all three roles.
7. Policyholder Submit a Claim form.
8. Policyholder My Claims list and submission confirmation.
9. Adjuster My Work Queue and assigned claim details.
10. CAT Events registry and Declare CAT Event form/modal.
11. Bulk Claim Intake page with validation and processing progress.
12. Shared claim details/triage review view that managers and authorised adjusters can open with role-appropriate actions.

### Shared deliverables
- Application shell and role-aware navigation.
- Shared component library and design tokens.
- Important loading, empty, error, success, permission-denied and degraded-model states.
- Connected navigation and representative end-to-end mock interactions.
- Consistent typography, spacing, iconography, colours and realistic synthetic content.
- A visible development/demo mode indicator whenever data or authentication is mocked.

Prioritise the CAT Command Dashboard and Priority Queue first, then complete the policyholder claim-submission flow and adjuster workspace using the same design system.

The final design should be polished enough for a product review, technically realistic for a React implementation and directly aligned with the INS-04 project requirements. Do not add features outside the defined MVP simply to make the interface look impressive.