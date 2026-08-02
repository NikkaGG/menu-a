# Mobile Tables and QR Cards Design

## Goal

Make QR downloads easy from the Russian admin panel on 320–767px screens
without changing the desktop workflow, API, data, or download behavior.

## Current Problem

The “Столы и QR-коды” page renders one table with a minimum width of 720px.
On a phone, only the table number and creation date are initially visible.
The QR download and delete actions sit outside the viewport behind horizontal
scroll. Large table rows also make the list feel unnecessarily tall.

## Responsive Layout

### Phones: below 768px

The existing semantic table and row components remain the single source of
markup and behavior, but CSS presents each body row as a compact card:

- the table no longer enforces a 720px minimum width;
- the header remains available to assistive technology but is visually hidden;
- each row has a bordered, rounded card treatment;
- the table number and creation date form a compact information area;
- the QR download and delete actions appear immediately below the information;
- both actions are always inside the viewport and remain at least 44px high;
- the actions may share one row when they fit, but must not create horizontal
  page overflow;
- long table names wrap inside the card without covering the date or actions;
- per-row QR errors remain adjacent to the card action area;
- delete errors remain inside the existing confirmation dialog.

The mobile list must not require horizontal scrolling. The card should use only
the vertical space needed by its content, with no inherited oversized table-row
height.

### Tablet and desktop: 768px and wider

The current table presentation remains:

- columns “Стол”, “Создан”, and “Действия”;
- existing desktop widths and action arrangement;
- horizontal containment remains available as a defensive fallback for
  unusually long content.

## Components and Behavior

The change is limited to the existing React/shadcn table composition:

- `TablesPage` controls the responsive table/container classes;
- `TableRow` supplies mobile labels and responsive cell/action classes;
- the existing shadcn `Table`, `Button`, and `AlertDialog` components remain;
- no new component package, API endpoint, or application state is introduced.

QR downloads continue through `api.tables.downloadQr(table.id, table.number)`.
Pending-state disabling, localized success/error messages, object URL cleanup,
delete confirmation, stale-operation guards, and focus behavior remain
unchanged.

## Accessibility

- The desktop header remains the semantic source of column names.
- On phones, each value receives a visible or screen-reader-accessible mobile
  label so the card does not rely on visual position alone.
- Download and delete buttons keep their existing table-specific accessible
  names.
- Controls remain at least 44×44px.
- The mobile transformation must not introduce duplicate interactive elements.
- Light and dark themes must continue to pass axe checks.

## Testing

### Unit and component contracts

- the mobile-responsive classes remove the 720px minimum at the base
  breakpoint and restore it at `md`;
- the table header is visually hidden on phones and restored at `md`;
- row cells expose mobile labels;
- download and delete handlers, pending states, errors, and dialogs remain
  covered;
- long names still wrap and the page remains axe-clean in both light and dark
  themes.

### Browser geometry

At 320px and 390px:

- document and table list have no horizontal overflow;
- QR download and delete controls are visible without scrolling sideways;
- controls are at least 44px high and 44px wide;
- rows render as separate compact cards with bounded spacing;
- long table names remain contained.
- long QR errors remain inside their card without overlapping values or
  actions;
- long delete errors remain contained inside the confirmation dialog;
- pending controls and a two-button action row remain contained when actions
  wrap;
- each row exposes exactly one QR action and one delete action;
- table, row, and cell roles remain available to the accessibility tree, with
  mobile labels connected to their values.

At 768px, 1024px, and 1440px:

- the standard table header and three-column layout are restored;
- existing QR, delete, dialog, and horizontal containment workflows pass.
- each row still exposes exactly one QR action and one delete action, with the
  normal table, row, column-header, and cell roles.

The current browser assertion that requires mobile horizontal overflow and
sideways scrolling must be replaced. Horizontal-scroll behavior remains tested
only as a desktop defensive fallback for exceptionally wide content. Phone
tests instead require zero list overflow and immediate action visibility.

## Non-goals

- No QR preview modal or bulk download.
- No change to QR image contents, filename, endpoint, or authentication.
- No redesign of the add-table dialog.
- No change to the public ordering pages, statistics page, bot, legacy admin
  fallback, or independent Sushi Crazy site.
