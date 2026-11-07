# Testing

## Tools

- [Vitest](https://vitest.dev/) runs the suites in `test/`.
- Coverage is collected with V8 (`@vitest/coverage-v8`) over `src/`.

## Commands

```sh
npm test            # vitest run --coverage
npx vitest          # watch mode while developing
npm run check       # every gate, including tests
```

## Test Coverage

The `test/index.test.ts` file covers the entire public API and critical edge cases:

- **Coordinates**: Validation of bounding box clamping, negative dimension normalization, and NaN handling.
- **History**: Verification of undo/redo integrity, stack resets on new mutations, and maximum history limits.
- **Spatial Queries**: Verification of hit testing logic for overlapping boxes, ray-casting for polygons, and Euclidean tolerance for points.
- **Transforms**: Verification of `viewToImage` and `imageToView` accuracy, including error handling for zoom-zero scenarios.
- **Interoperability**: Full cycle testing for COCO and YOLO export, ensuring valid output structures; import validation against schema errors and input size limits.
- **Error States**: Ensuring specific `AnnotateError` codes are thrown for all invalid operations, such as unknown labels, missing shapes, or limit violations.

## Reports

Coverage reports are written to `coverage/` (text summary and `lcov`). The folder is ignored by git.
