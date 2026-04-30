# HabiTrack — Frontend

This is the React + Vite frontend for HabiTrack.

For full setup instructions, folder structure, and documentation see the [root README](../README.md).

## Scripts

```bash
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

Email:    admin@habittrack.com
Password: Admin@1234


## Dev Proxy

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:5000` (backend).
Configured in `vite.config.js` — no CORS issues during development.
