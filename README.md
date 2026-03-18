# DJ Mix Dash

DJ Mix Dash is a browser-based DJ mixing application built with React, TypeScript, the Web Audio API, and Vercel Blob for community track storage.

## Features
- Dual Decks: Load and play tracks on two independent decks (A and B).
- Crossfader: Smoothly transition between tracks.
- Auto Drop: Automatically mix into the next track at a specified interval or at the end of the track.
- BPM Detection: Automatically detects the BPM of loaded tracks.
- 3-Band EQ & Filters: Adjust Low, Mid, and High frequencies, and apply Lowpass/Highpass filters.
- Mix Queue: Queue up tracks for automatic mixing.
- Community Tracks: Hybrid users can upload and share tracks through Vercel Blob-backed storage.

## Tech Stack
- React 19
- TypeScript
- Tailwind CSS
- Vite
- Lucide React
- Motion (Framer Motion)
- Web Audio API
- Vercel Blob

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd dj-mix-dash
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env as needed
   ```
4. For community uploads, add your Vercel Blob token:
   ```bash
   BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
   ```

### Development
Start the development server:
```bash
npm run dev
```
The application will be available at http://localhost:3000.

To exercise the Blob-backed API routes locally, run the app with Vercel's dev server instead of plain Vite:
```bash
npm run dev:vercel
```

### Building for Production
Build the application for production:
```bash
npm run build
```
The built files will be in the dist directory.

You can preview the production build with:
```bash
npm run preview
```

### Deploying to Vercel
Deploy the project root, not just the dist folder. The frontend build and the api functions must be deployed together.

Required Vercel project settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

Required environment variables:

- `BLOB_READ_WRITE_TOKEN`
- `APP_SESSION_SECRET` recommended for signed auth cookies. If omitted, the app falls back to `BLOB_READ_WRITE_TOKEN`.

Deployment flow:

1. Import the repository into Vercel.
2. Add `BLOB_READ_WRITE_TOKEN` in the project's environment variables.
3. Confirm the build settings above.
4. Deploy.

If you use the CLI instead of the dashboard:
```bash
npx vercel
npx vercel --prod
```

## License
MIT
