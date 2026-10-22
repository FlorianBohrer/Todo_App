/**
 * Bausteine für Software-Architektur im Planungsmodus.
 *
 * Wer eine Architektur plant, beginnt nicht mit einer leeren Seite, sondern
 * mit Fragen, die jedes Mal dieselben sind: Was bauen wir und was nicht?
 * Welche Teile gibt es, wer redet mit wem, wo liegen die Daten, was haben wir
 * entschieden und warum, was kann schiefgehen? Diese Datei gibt diesen Fragen
 * eine Form — als einzelne Blöcke über „/" und als ganze Vorlagen beim
 * Anlegen eines Plans.
 *
 * Die Diagramme sind Mermaid und rendern so, wie sie hier stehen: ein neuer
 * Diagrammblock zeigt sofort ein Bild, das man abändert, statt einer leeren
 * Fläche und einer Syntax, die man erst nachschlagen müsste.
 *
 * Reine Funktionen: keine Angular-Abhängigkeit, Kennungen kommen von außen.
 */
import {
  PlanBlock,
  PlanDiagramBlock,
  PlanGroupBlock,
  PlanListBlock,
  PlanTableBlock,
} from './plan.model';

type NewId = () => string;

// ---------------------------------------------------------------------------
// Diagramme
// ---------------------------------------------------------------------------

export type ArchitectureDiagram = 'system' | 'sequence' | 'data' | 'classes' | 'states';

export const DIAGRAM_TEMPLATES: Record<ArchitectureDiagram, string> = {
  // Wer spricht mit wem, wo liegen die Daten. Subgraphs für Grenzen
  // (Backend, extern), runde Klammern für Datenbanken, doppelte für Queues.
  system: `flowchart LR
  user([User]) --> web[Web app]
  web --> api[API gateway]
  subgraph Backend
    api --> auth[Auth service]
    api --> core[Core service]
    core --> queue[[Job queue]]
    queue --> worker[Worker]
  end
  core --> db[(Database)]
  worker --> db
  core --> cache[(Cache)]
  worker --> mail{{Email provider}}`,

  // Ein Ablauf über die Grenzen hinweg, nummeriert.
  sequence: `sequenceDiagram
  autonumber
  actor User
  participant Web as Web app
  participant API
  participant DB as Database
  User->>Web: Place order
  Web->>API: POST /orders
  API->>DB: insert order
  DB-->>API: order id
  API-->>Web: 201 Created
  Web-->>User: Confirmation`,

  // Entitäten, Schlüssel, Beziehungen.
  data: `erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "appears in"
  USER {
    uuid id PK
    string email
  }
  ORDER {
    uuid id PK
    uuid user_id FK
    datetime created_at
  }
  ORDER_ITEM {
    uuid order_id FK
    uuid product_id FK
    int quantity
  }
  PRODUCT {
    uuid id PK
    string name
  }`,

  // Module, Schnittstellen, Abhängigkeiten.
  classes: `classDiagram
  class OrderService {
    +placeOrder(cart) Order
    +cancel(orderId) void
  }
  class OrderRepository {
    <<interface>>
    +save(order) void
    +findById(id) Order
  }
  class PaymentGateway {
    <<interface>>
    +charge(amount) Receipt
  }
  OrderService --> OrderRepository
  OrderService --> PaymentGateway
  OrderRepository <|.. PostgresOrderRepository`,

  // Lebenszyklus eines Objekts.
  states: `stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted: submit
  Submitted --> Approved: approve
  Submitted --> Rejected: reject
  Rejected --> Draft: revise
  Approved --> Shipped: ship
  Shipped --> [*]`,
};

export function diagramBlock(id: string, kind: ArchitectureDiagram): PlanDiagramBlock {
  return { id, type: 'diagram', code: DIAGRAM_TEMPLATES[kind] };
}

// ---------------------------------------------------------------------------
// Tabellen
// ---------------------------------------------------------------------------

/** Was gibt es, was tut es, womit, wer kümmert sich. */
export function componentsTable(id: string): PlanTableBlock {
  return {
    id,
    type: 'table',
    columns: ['Component', 'Responsibility', 'Tech', 'Owner'],
    rows: [
      ['Web app', 'UI, client-side state', 'Angular', ''],
      ['API gateway', 'Routing, auth, rate limits', '', ''],
      ['', '', '', ''],
    ],
    wide: true,
  };
}

/** Die Schnittstelle als Liste, die man vor dem Code abstimmt. */
export function endpointsTable(id: string): PlanTableBlock {
  return {
    id,
    type: 'table',
    columns: ['Method', 'Path', 'Purpose', 'Auth'],
    rows: [
      ['GET', '/orders/:id', 'Read one order', 'User'],
      ['POST', '/orders', 'Place an order', 'User'],
      ['', '', '', ''],
    ],
    wide: true,
  };
}

/** Was schiefgehen kann — und was man vorher dagegen tut. */
export function risksTable(id: string): PlanTableBlock {
  return {
    id,
    type: 'table',
    columns: ['Risk', 'Impact', 'Likelihood', 'Mitigation'],
    rows: [
      ['', 'High', 'Medium', ''],
      ['', 'Low', 'Low', ''],
    ],
    wide: true,
  };
}

/** Qualitätsziele: messbar, sonst sind es Wünsche. */
function qualityTable(id: string): PlanTableBlock {
  return {
    id,
    type: 'table',
    columns: ['Quality', 'Target', 'How we measure'],
    rows: [
      ['Latency (p95)', '', ''],
      ['Availability', '', ''],
      ['Throughput', '', ''],
      ['Data retention', '', ''],
      ['Security & privacy', '', ''],
    ],
  };
}

function alternativesTable(id: string): PlanTableBlock {
  return {
    id,
    type: 'table',
    columns: ['Option', 'Pros', 'Cons'],
    rows: [
      ['', '', ''],
      ['', '', ''],
    ],
  };
}

// ---------------------------------------------------------------------------
// Entscheidungen (ADR)
// ---------------------------------------------------------------------------

/** „2026-10-22" — das Datum gehört in eine Entscheidung, nicht in die Erinnerung. */
function isoDay(today: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

function bullets(id: string, items: string[]): PlanListBlock {
  return { id, type: 'list', variant: 'bullet', items: items.map((text) => ({ text, checked: false })) };
}

/** Der Inhalt einer Architekturentscheidung, ohne Rahmen. */
function decisionBody(newId: NewId, today: Date): PlanBlock[] {
  return [
    { id: newId(), type: 'text', text: `**Status:** Proposed · **Date:** ${isoDay(today)} · **Deciders:** ` },
    { id: newId(), type: 'heading', level: 3, text: 'Context' },
    { id: newId(), type: 'text', text: 'What forces us to decide now? Constraints, requirements, what we know and what we do not.' },
    { id: newId(), type: 'heading', level: 3, text: 'Decision' },
    { id: newId(), type: 'text', text: 'We will …' },
    { id: newId(), type: 'heading', level: 3, text: 'Consequences' },
    bullets(newId(), ['Easier: ', 'Harder: ', 'Follow-up work: ']),
    { id: newId(), type: 'heading', level: 3, text: 'Alternatives considered' },
    alternativesTable(newId()),
  ];
}

/**
 * Eine Architekturentscheidung als aufklappbarer Abschnitt.
 *
 * Im Plan stehen meist mehrere; zugeklappt bleibt der Titel als Liste der
 * Entscheidungen, aufgeklappt das Warum. Status, Datum und Beteiligte in der
 * ersten Zeile, damit man eine alte Entscheidung als alt erkennt.
 */
export function decisionRecord(newId: NewId, today = new Date()): PlanGroupBlock {
  return {
    id: newId(),
    type: 'group',
    title: 'Decision: ',
    collapsed: false,
    blocks: decisionBody(newId, today),
  };
}

// ---------------------------------------------------------------------------
// Ganze Vorlagen
// ---------------------------------------------------------------------------

export type PlanTemplate = 'system-design' | 'decision' | 'api-design';

export interface PlanTemplateInfo {
  kind: PlanTemplate;
  label: string;
  hint: string;
  /** Titel des neuen Plans — zum Überschreiben gedacht. */
  title: string;
}

export const PLAN_TEMPLATES: readonly PlanTemplateInfo[] = [
  {
    kind: 'system-design',
    label: 'System design',
    hint: 'Goals, architecture, data, flows, risks',
    title: 'System design: ',
  },
  {
    kind: 'decision',
    label: 'Architecture decision',
    hint: 'One decision with context and trade-offs',
    title: 'ADR: ',
  },
  {
    kind: 'api-design',
    label: 'API design',
    hint: 'Resources, endpoints, errors, examples',
    title: 'API: ',
  },
];

const heading = (newId: NewId, level: 1 | 2 | 3, text: string): PlanBlock => ({
  id: newId(),
  type: 'heading',
  level,
  text,
});

const text = (newId: NewId, value: string): PlanBlock => ({ id: newId(), type: 'text', text: value });

function todos(id: string, items: string[]): PlanListBlock {
  return { id, type: 'list', variant: 'todo', items: items.map((value) => ({ text: value, checked: false })) };
}

function systemDesign(newId: NewId, today: Date): PlanBlock[] {
  return [
    text(newId, 'One paragraph: what we are building, for whom, and why now.'),

    heading(newId, 2, 'Goals'),
    bullets(newId(), ['', '']),
    heading(newId, 2, 'Non-goals'),
    bullets(newId(), ['']),

    heading(newId, 2, 'Requirements'),
    heading(newId, 3, 'Functional'),
    bullets(newId(), ['', '']),
    heading(newId, 3, 'Quality targets'),
    qualityTable(newId()),

    heading(newId, 2, 'Architecture'),
    diagramBlock(newId(), 'system'),
    text(newId, 'Walk through the diagram: the main request path, where state lives, what is synchronous and what is not.'),

    heading(newId, 2, 'Components'),
    componentsTable(newId()),

    heading(newId, 2, 'Data model'),
    diagramBlock(newId(), 'data'),

    heading(newId, 2, 'Key flows'),
    diagramBlock(newId(), 'sequence'),

    heading(newId, 2, 'APIs'),
    endpointsTable(newId()),

    heading(newId, 2, 'Decisions'),
    decisionRecord(newId, today),

    heading(newId, 2, 'Risks'),
    risksTable(newId()),

    heading(newId, 2, 'Rollout'),
    { id: newId(), type: 'list', variant: 'number', items: [
      { text: 'Behind a feature flag for the team', checked: false },
      { text: 'Gradual rollout, watch the quality targets', checked: false },
      { text: 'Remove the old path', checked: false },
    ] },

    heading(newId, 2, 'Open questions'),
    todos(newId(), ['']),
  ];
}

function apiDesign(newId: NewId): PlanBlock[] {
  return [
    text(newId, 'Who calls this API, for what, and what it promises them.'),

    heading(newId, 2, 'Resources'),
    diagramBlock(newId(), 'data'),

    heading(newId, 2, 'Endpoints'),
    endpointsTable(newId()),

    heading(newId, 2, 'Example'),
    {
      id: newId(),
      type: 'code',
      language: 'http',
      code: `POST /orders
Content-Type: application/json

{
  "items": [{ "productId": "p_123", "quantity": 2 }]
}

201 Created
{ "id": "o_456", "status": "submitted" }`,
    },

    heading(newId, 2, 'Errors'),
    {
      id: newId(),
      type: 'table',
      columns: ['Status', 'Code', 'When'],
      rows: [
        ['400', 'invalid_request', 'Body does not match the schema'],
        ['401', 'unauthenticated', 'Missing or expired token'],
        ['404', 'not_found', 'The resource does not exist or is not yours'],
        ['409', 'conflict', ''],
      ],
    },

    heading(newId, 2, 'Auth, limits, versioning'),
    bullets(newId(), ['Auth: ', 'Rate limits: ', 'Pagination: ', 'Versioning: ']),

    heading(newId, 2, 'Key flow'),
    diagramBlock(newId(), 'sequence'),

    heading(newId, 2, 'Open questions'),
    todos(newId(), ['']),
  ];
}

/** Der Inhalt eines neuen Plans aus einer Vorlage. */
export function templateContent(kind: PlanTemplate, newId: NewId, today = new Date()): PlanBlock[] {
  switch (kind) {
    case 'system-design':
      return systemDesign(newId, today);
    case 'decision':
      return decisionBody(newId, today);
    case 'api-design':
      return apiDesign(newId);
  }
}
