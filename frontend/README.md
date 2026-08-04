# Bus Booking Frontend

TypeScript frontend for the bus booking backend.

## Run locally

1. Start the FastAPI backend first so the UI can load trips and seat availability.
2. Open a terminal in this folder:

```bash
cd frontend
npm install
npm run dev
```

3. Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

The Vite dev server proxies `/api` requests to `http://127.0.0.1:8000`, so the frontend can call the backend without a separate CORS setup.

## Production preview

```bash
npm run build
npm run preview
```

If your backend runs on a different host or port, set `VITE_API_BASE_URL` before starting Vite.
