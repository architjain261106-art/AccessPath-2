import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  synthesizeVenueFromYouTube,
  PRESET_VENUES,
  DLF_MALL_PRESET,
  type SynthesizedVenue,
} from './src/services/venueSynthesizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// In-memory state for authoritative server
interface NavigationSession {
  id: string;
  device: string;
  mobilityProfile: 'wheelchair' | 'crutches' | 'standard';
  origin: string;
  destination: string;
  currentFloor: number;
  currentProgress: number;
  lastActive: number;
}

interface ConfirmedBlockage {
  id: string;
  locationId: string;
  locationName: string;
  title: string;
  hazardType: 'broken_elevator' | 'broken_escalator' | 'broken_flooring' | 'blocked_corridor' | 'wet_surface';
  floor: 0 | 1;
  severity: 'critical' | 'high' | 'moderate';
  affectsWheelchairs: boolean;
  confirmedAt: number;
  confirmedBy: string;
  description: string;
}

const activeSessions = new Map<string, NavigationSession>();
const clientSockets = new Map<WebSocket, string>();
const activeBlockages: ConfirmedBlockage[] = [
  // Initial demo blockage if needed or start clean
];

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data: any, exceptWs?: WebSocket) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastToAll(data: any) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws: WebSocket, req) => {
  console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);

  // Send initial handshake acknowledgement
  ws.send(
    JSON.stringify({
      type: 'session:ack',
      serverTime: Date.now(),
      connectedClientsCount: wss.clients.size,
      activeBlockages,
      message: 'WebSocket connection established with DLF Mall Navigation Engine',
    })
  );

  ws.on('message', (rawMessage: string) => {
    try {
      const data = JSON.parse(rawMessage.toString());

      switch (data.type) {
        case 'ping': {
          ws.send(
            JSON.stringify({
              type: 'pong',
              clientTime: data.clientTime,
              serverTime: Date.now(),
            })
          );
          break;
        }

        case 'session:init': {
          const sessionId = data.sessionId || `sess-${Date.now()}`;
          clientSockets.set(ws, sessionId);
          activeSessions.set(sessionId, {
            id: sessionId,
            device: data.device || 'Web Browser',
            mobilityProfile: data.mobilityProfile || 'wheelchair',
            origin: data.origin || 'gate_1',
            destination: data.destination || 'pvr_gold',
            currentFloor: data.currentFloor || 0,
            currentProgress: data.currentProgress || 0,
            lastActive: Date.now(),
          });

          broadcastToAll({
            type: 'stats:update',
            activeSessionsCount: activeSessions.size,
            connectedClientsCount: wss.clients.size,
            blockagesCount: activeBlockages.length,
          });
          break;
        }

        case 'session:update': {
          const sessId = clientSockets.get(ws) || data.sessionId;
          if (sessId && activeSessions.has(sessId)) {
            const current = activeSessions.get(sessId)!;
            activeSessions.set(sessId, {
              ...current,
              mobilityProfile: data.mobilityProfile || current.mobilityProfile,
              origin: data.origin || current.origin,
              destination: data.destination || current.destination,
              currentProgress: data.currentProgress ?? current.currentProgress,
              currentFloor: data.currentFloor ?? current.currentFloor,
              lastActive: Date.now(),
            });
          }
          break;
        }

        case 'admin:confirm_blockage': {
          const blockage: ConfirmedBlockage = {
            id: data.id || `blk-${Date.now()}`,
            locationId: data.locationId,
            locationName: data.locationName,
            title: data.title || 'Emergency Path Blockage',
            hazardType: data.hazardType || 'blocked_corridor',
            floor: data.floor ?? 0,
            severity: data.severity || 'high',
            affectsWheelchairs: data.affectsWheelchairs ?? true,
            confirmedAt: Date.now(),
            confirmedBy: data.confirmedBy || 'Mall Operations Admin',
            description: data.description || 'Temporary physical obstruction confirmed by Administrator.',
          };

          // Store in server authoritative state if not already existing
          const existingIdx = activeBlockages.findIndex((b) => b.locationId === blockage.locationId);
          if (existingIdx >= 0) {
            activeBlockages[existingIdx] = blockage;
          } else {
            activeBlockages.push(blockage);
          }

          console.log(`[WS] Admin confirmed blockage at ${blockage.locationName}. Broadcasting urgent reroute.`);

          // Stream immediate live path update & reroute event to ALL active sessions
          broadcastToAll({
            type: 'reroute:urgent',
            timestamp: Date.now(),
            blockage,
            alertMessage: `🚨 URGENT REROUTE: Administrator confirmed blockage at ${blockage.locationName} (${blockage.title}). All active navigation paths are being dynamically recalculated!`,
            activeBlockages,
          });
          break;
        }

        case 'admin:clear_blockage': {
          const blockageId = data.blockageId;
          const locationId = data.locationId;
          const index = activeBlockages.findIndex((b) => b.id === blockageId || b.locationId === locationId);
          let clearedItem: ConfirmedBlockage | null = null;
          if (index >= 0) {
            clearedItem = activeBlockages.splice(index, 1)[0];
          }

          console.log(`[WS] Admin cleared blockage ${blockageId || locationId}. Broadcasting restoration.`);

          broadcastToAll({
            type: 'reroute:restored',
            timestamp: Date.now(),
            clearedBlockageId: blockageId,
            clearedLocationId: locationId,
            clearedItem,
            alertMessage: `✨ Path Restored: Obstruction at ${clearedItem?.locationName || locationId || 'location'} has been cleared. Recalculating optimal route.`,
            activeBlockages,
          });
          break;
        }

        default:
          console.warn(`[WS] Unknown message type: ${data.type}`);
      }
    } catch (err) {
      console.error('[WS] Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    const sessionId = clientSockets.get(ws);
    if (sessionId) {
      activeSessions.delete(sessionId);
      clientSockets.delete(ws);
    }
    console.log(`[WS] Client disconnected. Active sessions: ${activeSessions.size}`);
    broadcastToAll({
      type: 'stats:update',
      activeSessionsCount: activeSessions.size,
      connectedClientsCount: wss.clients.size,
      blockagesCount: activeBlockages.length,
    });
  });
});

// REST Endpoints for observability and external webhook integration
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    connectedClients: wss.clients.size,
    activeSessions: activeSessions.size,
    activeBlockages: activeBlockages.length,
    timestamp: Date.now(),
  });
});

app.get('/api/blockages', (_req, res) => {
  res.json({
    blockages: activeBlockages,
  });
});

app.post('/api/admin/confirm-blockage', (req, res) => {
  const data = req.body;
  const blockage: ConfirmedBlockage = {
    id: data.id || `blk-${Date.now()}`,
    locationId: data.locationId || 'elevator_central_l0',
    locationName: data.locationName || 'Central Glass Lift',
    title: data.title || 'Emergency Path Blockage',
    hazardType: data.hazardType || 'broken_elevator',
    floor: data.floor ?? 0,
    severity: data.severity || 'critical',
    affectsWheelchairs: data.affectsWheelchairs ?? true,
    confirmedAt: Date.now(),
    confirmedBy: data.confirmedBy || 'Mall Operations Admin (API)',
    description: data.description || 'Confirmed by security console API.',
  };

  const existingIdx = activeBlockages.findIndex((b) => b.locationId === blockage.locationId);
  if (existingIdx >= 0) {
    activeBlockages[existingIdx] = blockage;
  } else {
    activeBlockages.push(blockage);
  }

  broadcastToAll({
    type: 'reroute:urgent',
    timestamp: Date.now(),
    blockage,
    alertMessage: `🚨 URGENT REROUTE: Administrator confirmed blockage at ${blockage.locationName}. All active sessions recalculating routes!`,
    activeBlockages,
  });

  res.json({ success: true, blockage });
});

app.post('/api/admin/clear-blockage', (req, res) => {
  const { blockageId, locationId } = req.body;
  const index = activeBlockages.findIndex((b) => b.id === blockageId || b.locationId === locationId);
  let clearedItem: ConfirmedBlockage | null = null;
  if (index >= 0) {
    clearedItem = activeBlockages.splice(index, 1)[0];
  }

  broadcastToAll({
    type: 'reroute:restored',
    timestamp: Date.now(),
    clearedBlockageId: blockageId,
    clearedLocationId: locationId,
    clearedItem,
    alertMessage: `✨ Path Cleared: Obstruction at ${clearedItem?.locationName || 'location'} has been resolved.`,
    activeBlockages,
  });

  res.json({ success: true, cleared: clearedItem });
});

// In-memory venues database (initialized with presets)
const venuesMap = new Map<string, SynthesizedVenue>(Object.entries(PRESET_VENUES));

// GET /api/venues - Return all available 3D venues
app.get('/api/venues', (_req, res) => {
  const venues = Array.from(venuesMap.values()).map((v) => ({
    id: v.id,
    venueName: v.venueName,
    venueSubtitle: v.venueSubtitle,
    description: v.description,
    youtubeUrl: v.youtubeUrl,
    videoId: v.videoId,
    videoTitle: v.videoTitle,
    authorName: v.authorName,
    thumbnailUrl: v.thumbnailUrl,
    zonesCount: v.zones.length,
    edgesCount: v.edges.length,
    floorsCount: v.floors.length,
    defaultOrigin: v.defaultOrigin,
    defaultDestination: v.defaultDestination,
    generatedByAi: v.generatedByAi,
    summaryHighlights: v.summaryHighlights,
  }));
  res.json({ venues });
});

// GET /api/venues/:id - Get full 3D graph and nodes for a venue
app.get('/api/venues/:id', (req, res) => {
  const venue = venuesMap.get(req.params.id);
  if (!venue) {
    return res.status(404).json({ error: 'Venue not found' });
  }
  res.json({ venue });
});

// POST /api/generate-venue-from-youtube - Synthesize 3D spatial map from YouTube URL
app.post('/api/generate-venue-from-youtube', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
      return res.status(400).json({ error: 'A valid YouTube URL is required' });
    }

    console.log(`[YouTube 3D Synthesizer] Processing URL: ${youtubeUrl}`);
    const synthesizedVenue = await synthesizeVenueFromYouTube(youtubeUrl);

    // Save in server venue registry
    venuesMap.set(synthesizedVenue.id, synthesizedVenue);

    console.log(`[YouTube 3D Synthesizer] Successfully synthesized venue: ${synthesizedVenue.venueName} with ${synthesizedVenue.zones.length} zones and ${synthesizedVenue.edges.length} edges.`);

    res.json({
      success: true,
      venue: synthesizedVenue,
    });
  } catch (err: any) {
    console.error('[YouTube 3D Synthesizer] Synthesis error:', err);
    res.status(500).json({
      error: 'Failed to synthesize 3D map from YouTube URL',
      details: err?.message || String(err),
    });
  }
});

// Dev vs Prod Vite Mounting
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP/WS Server] AccessPath navigation server listening on http://0.0.0.0:${PORT}`);
  console.log(`[HTTP/WS Server] WebSocket endpoint active at ws://0.0.0.0:${PORT}/ws`);
});
