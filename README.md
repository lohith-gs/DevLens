# DevLens

> See deeper into your network. Diff, correlate, schema-extract and visualize network requests.

DevLens is a Chrome DevTools extension that replaces squinting at the Network tab with a purpose-built panel for inspecting, comparing, and understanding API traffic.

<img width="958" height="722" alt="Screenshot 2026-05-25 at 9 37 44 PM" src="https://github.com/user-attachments/assets/f9debb64-5027-4b6e-9b9e-01536328a021" />

---

## Features

### Inspector
Browse every captured request with method badge, status code, URL, and duration at a glance. Click any request to open a full interactive JSON tree — expand, collapse, search keys and values, copy JSON paths, and copy the entire response body in one click.

### Compare
Pin any two requests and diff their responses side by side or as a unified diff. Added, removed, and changed fields are color-coded. Correlation mode automatically highlights matching values across both payloads so you can spot shared IDs and tokens instantly.

### Schema Extract
Select any JSON response and generate a TypeScript interface, type alias, or Zod schema in one click. Rename the root type, drill into a nested subtree, and copy the output straight to your clipboard.

### Timeline
Visualize all captured requests on a horizontal timeline. Group by domain, filter to slow or failed calls, and see cascade chains at a glance.

### GraphQL Support
DevLens auto-detects GraphQL requests and gives them a dedicated tab with syntax-highlighted query display, operation type badge, and a variables viewer. The request list shows operation names and repeat counts, and you can filter by operation in one click.

### Global Search
Search across every captured request and response body at once. Results show the matched field, value, and which request it came from.

### Entity Tracker
Surfaces tokens, IDs, emails, and auth-related values found across all traffic so you can track how data flows between requests.

---

## Getting Started

### Install from the Chrome Web Store
Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/allolniimedofhingkeodfglnogcmelj) and click Add to Chrome.

### How to use it
1. Open Chrome DevTools on any page — press `F12` on Windows/Linux or `Cmd+Option+I` on Mac
2. Click the **DevLens** tab in the DevTools toolbar (use the `>>` arrow if it is not visible)
3. Navigate to any page or trigger API calls — requests appear in the panel automatically

> Clicking the DevLens icon in the browser toolbar does nothing. DevLens lives inside Chrome DevTools, not as a popup.

---

## Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/lohith-gs/DevLens.git
cd DevLens
npm install
```

### Build

```bash
# Production build
npm run build

# The compiled extension lands in dist/
```

### Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

Any time you change source files, run `npm run build` again and click the reload button on the extension card in `chrome://extensions`.

---

## Project Structure

```
src/
  background.ts              # Service worker (minimal stub)
  devtools.ts                # Registers the DevTools panel
  devtools.html              # DevTools page entry
  panel/
    index.tsx                # App root
    styles.css               # Tailwind + custom design tokens
    components/
      RequestList.tsx        # Left sidebar with filters
      Inspector.tsx          # Response/request/headers/params tabs
      JsonViewer.tsx         # Interactive JSON tree
      SideBySideView.tsx     # Compare + diff panel
      DiffViewer.tsx         # Unified diff renderer
      SchemaExtractor.tsx    # TypeScript/Zod schema generator
      TimelineView.tsx       # Horizontal request timeline
      GraphQLInspector.tsx   # GraphQL query + variables viewer
      GlobalSearch.tsx       # Full-text search across all traffic
      EntityTracker.tsx      # Token/ID/auth value detection
    hooks/
      useNetworkRequests.ts  # Captures requests via DevTools API
      usePinnedRequests.ts   # Pin state for comparison
    utils/
      graphql.ts             # GraphQL detection and parsing
      diffJson.ts            # JSON diff algorithm
      correlateFields.ts     # Cross-payload value correlation
      generateSchema.ts      # TypeScript/Zod schema generation
      detectEntities.ts      # Auth/token/ID heuristics
      buildTimeline.ts       # Timeline layout calculations
```

---

## Tech Stack

- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Webpack 5** for bundling
- **Chrome Manifest V3**
- **Lucide React** for icons

---

## Privacy

DevLens operates entirely inside your browser. No data is sent to any external server. No analytics, no tracking, no account required. The `storage` permission is used only to persist pinned requests locally across DevTools sessions.

---

## License

MIT
