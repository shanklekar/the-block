# Repo Instructions

## Project context
- This repo includes a frontend React app, a backend Python FastAPI app, and `data/vehicles.sqlite` as part of the project stack for the OPENLANE "The Block" coding challenge.
- Treat the frontend, backend, and SQLite data layer as first-class parts of the repo when making changes.

## Coding standards
- Use React function components and ES modules.
- Keep components small and readable.
- Prefer clear naming over clever abstractions.
- Preserve existing file structure unless there is a strong reason to change it.

## UX expectations
- Prioritize mobile + desktop usability.
- Keep the UI intentional and polished.
- Optimize for inventory browsing, vehicle detail clarity, and bidding flows.

## Data
- Use `data/vehicles.sqlite` as the primary data source unless told otherwise.
- Prefer working with the existing FastAPI backend rather than inventing new services or APIs unless explicitly requested.

## Validation
- After changes, run `npm run build`.
