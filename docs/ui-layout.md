# UI layout

Layout of the web app (`apps/web`) and how its pages connect. Diagrams are draw.io files in `docs/diagrams/`; labels in them are the real Polish UI texts (NFR-7). Update this file in the same change as any page, route or navigation change.

## Shell and conventions

Every page renders inside one shell (`App.tsx`): a centred column (`max-w-3xl`, 16 px side padding) with a header and the routed page below it.

```text
+--------------------------------------------------+
| [Aplikacja do nauki]  <- link to "/"             |
+--------------------------------------------------+
| <page content: a vertical stack of cards>        |
+--------------------------------------------------+
```

- **Card** (`components/ui.tsx`): white rounded box with a border; the unit all pages are built from.
- **Spinner** (`role=status`): "Ładowanie…" or a state-specific text while data loads.
- **ErrorMessage** (`role=alert`): red box with the error text.
- **Polling**: while a questionnaire is `generating`, a submission is `reviewing`, or a learning detail lists either, the page refetches every 2 s (TanStack Query `refetchInterval`) and swaps its content when the status changes.

## Page relations

![Page relations](diagrams/page-relations.drawio.svg)

Solid arrows are navigation, labelled with the trigger. Dashed loops are asynchronous states in which the page refreshes itself.

Notes:
- A submission page has no link back; the user returns through the header (to the topic list) or the browser's back button.
- A questionnaire or submission page also opens by direct URL; the Learning detail page links to both.

## Pages

### 1. Learnings: `/`

![Learnings page layout](diagrams/page-learnings.drawio.svg)

### 2. Learning detail: `/learnings/:id`

![Learning detail page layout](diagrams/page-learning-detail.drawio.svg)

### 3. Questionnaire: `/questionnaires/:id`

Three states share the route:

```text
generating:   "Claude generuje Twój zestaw pytań…"   (spinner, polls)
failed:       [ error box with the stored message ]
ready:        the answer form below
```

![Questionnaire page layout](diagrams/page-questionnaire.drawio.svg)

The draft is saved to `localStorage` whenever focus leaves an input and cleared after a successful submit.

### 4. Submission: `/submissions/:id`

Three states share the route:

```text
reviewing:    "Claude ocenia Twoje odpowiedzi…"      (spinner, polls)
failed:       [ error box ]  [ Ponów ocenę ]          (retry re-runs the review)
reviewed:     the result below
```

![Submission page layout](diagrams/page-submission.drawio.svg)

### 5. Not found: `*`

The shell (header link) with the single line "Nie znaleziono strony." below it. No separate diagram; it appears in the page relations diagram.

Pages 2 to 4 show an `ErrorMessage` ("Nie znaleziono" or the API error) when the id does not exist.

## Editing diagrams

The files in `docs/diagrams/` are `.drawio.svg`: ordinary SVG images (so they show in Markdown and on GitHub) that also embed the editable draw.io diagram. To change one, open it in draw.io (app.diagrams.net, the desktop app, or the VS Code "Draw.io Integration" extension), edit, and save in place with the same file name and format. Keep the labels in sync with the real UI texts, and update the diagram in the same change as the page.
