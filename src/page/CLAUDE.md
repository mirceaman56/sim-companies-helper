# Page Adapter Conventions (src/page)

Adapters are the only code that knows the game's DOM. `npm run check:architecture` fails on game selectors anywhere else and on imports outside `src/page/**`, `src/utils.js`, `src/constants.js`.

### Shared helpers - `src/page/page_utils.js`

Always prefer these over rolling your own observer or traversal logic:

- `observeDocumentBody(onChange, { root?, options? }?)` - body-level observation; callers with default options share one MutationObserver. Returns a cleanup function.
- `observeMutations(target, onChange, options?)` - observe any other node, returns a cleanup function.
- `onRouteChange(onChange, { win? }?)` - SPA navigation (Navigation API + 1 s location check). Returns a cleanup function. The new page renders after the event: wait for structure (`waitForStructuralValue`) before binding observers.
- `findAncestorWithin(target, predicate, { maxDepth?, boundary? }?)` - bounded ancestor walk.
- `findClosestWithin(target, selector, { maxDepth?, boundary? }?)` - selector-based ancestor search.
- `hasAllSelectors(root, selectors[])` / `hasAnySelector(root, selectors[])` - structural readiness checks.
- `waitForStructuralValue({ target, readValue, isReady, timeoutMs? })` - resolves once DOM is ready.
- `extractProductIdFromRow(row)` / `getInfoColumn(row)` - encyclopedia product id and info column of a game row.
- `findLastDigitLeaf(root)`, `setReactControlledValue(input, value)`.

### Adapter naming conventions

For each domain, keep the shape consistent:

- `detect*Page(root)` - returns true/false for page detection.
- `find*FromTarget(target)` - walks from an event target to the relevant row/element.
- `findFirst*Row(root)` - locates the first meaningful row.
- `read*Row(row)` / `read*(row)` - parses into a stable plain-object or primitive shape.
- `observe*Page(root, onChange)` - wraps `observeDocumentBody` and returns a cleanup function.

Return raw values (strings/numbers); parsing that is not about DOM structure belongs in `*_calc.js`.

### Adapter testing

- Tests live in `tests/*_page.test.js`.
- HTML fixtures go in `tests/fixtures/<domain>/` (at least a primary and a fallback shape; enforced by `tests/page_adapter_contract_coverage.test.js`).
- Cover: page detection, row lookup, parsing, and fallback paths for partial DOM.
