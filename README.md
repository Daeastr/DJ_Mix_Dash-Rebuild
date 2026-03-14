# DJ Mix Dash

DJ Mix Dash is a browser-based DJ mixing application built with React, TypeScript, and the Web Audio API.

## Features
- Dual Decks: Load and play tracks on two independent decks (A and B).
- Crossfader: Smoothly transition between tracks.
- Auto Drop: Automatically mix into the next track at a specified interval or at the end of the track.
- BPM Detection: Automatically detects the BPM of loaded tracks.
- 3-Band EQ & Filters: Adjust Low, Mid, and High frequencies, and apply Lowpass/Highpass filters.
- Mix Queue: Queue up tracks for automatic mixing.

## Tech Stack
- React 19
- TypeScript
- Tailwind CSS
- Vite
- Lucide React
- Motion (Framer Motion)
- Web Audio API

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

### Development
Start the development server:
```bash
npm run dev
```
The application will be available at http://localhost:3000.

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

## License
MIT
