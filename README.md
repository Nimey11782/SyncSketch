# SyncSketch

### Real-Time Collaborative Whiteboard

SyncSketch is a real-time collaborative whiteboard that allows multiple users to draw on the same canvas simultaneously.

The application uses **FastAPI WebSockets** for real-time communication and **PostgreSQL** for persistent storage of completed drawing strokes.

## Live Demo

[Open SyncSketch](https://syncsketch-frontend-0pfb.onrender.com/)

## Features

- Real-time collaborative drawing
- Live stroke streaming while users are drawing
- Room-based collaboration
- WebSocket-based bidirectional communication
- Undo and clear canvas operations
- Automatic WebSocket reconnection
- PostgreSQL persistence for completed strokes
- Separate overlay canvas for transient remote strokes
- New users receive the existing room state when joining
- Dockerized deployment

## Architecture

                         ┌─────────────────┐
                         │    Browser A    │
                         │                 │
                         │ Canvas + JS     │
                         └────────┬────────┘
                                  │
                              WebSocket
                                  │
                                  ▼
                         ┌─────────────────┐
                         │     FastAPI     │
                         │                 │
                         │ WebSocket Layer │
                         │  Room Manager   │
                         └────────┬────────┘
                                  │
                           SQLAlchemy Async
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   PostgreSQL    │
                         │                 │
                         │     strokes     │
                         └─────────────────┘
                                  ▲
                                  │
                              WebSocket
                                  │
                         ┌────────┴────────┐
                         │    Browser B    │
                         │                 │
                         │ Canvas + JS     │
                         └─────────────────┘
