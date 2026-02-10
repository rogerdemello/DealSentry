# Server Stability Improvements

This document outlines the improvements made to prevent frequent API server disconnections.

## Changes Made

### 1. Enhanced Error Handling in Server (`server.ts`)
- **Graceful Shutdown**: Added handlers for SIGTERM and SIGINT signals
- **Uncaught Exception Handling**: Prevents server crashes from unhandled errors
- **Port Conflict Detection**: Automatically detects and reports if port 3001 is already in use
- **Automatic Recovery**: Server logs errors but continues running in development mode

### 2. API Client Retry Logic (`src/lib/api-client.ts`)
- **Automatic Retries**: Up to 3 retry attempts for failed requests
- **Exponential Backoff**: Gradually increases delay between retries (1s, 2s, 3s)
- **Smart Retry**: Only retries on network errors and specific HTTP status codes (408, 429, 500, 502, 503, 504)
- **Better Error Messages**: Clear distinction between network and API errors

### 3. Improved Startup Script (`start.bat`)
- **Dependency Check**: Verifies Node.js is installed before starting
- **Port Cleanup**: Automatically kills processes using ports 3001 or 8080
- **Sequential Startup**: Waits for API server to start before launching frontend
- **Health Verification**: Checks if API server is responding before continuing
- **Clear Error Messages**: Provides helpful troubleshooting steps

### 4. Connection Monitoring (`src/hooks/use-api-connection.ts`)
- **Automatic Monitoring**: Checks API health every 30 seconds
- **Fast Recovery**: When disconnected, checks every 5 seconds for reconnection
- **User Notifications**: Toast notifications when connection is lost or restored
- **Window Focus Check**: Verifies connection when user returns to the app
- **Visual Feedback**: Users know immediately when the server goes offline

### 5. Clean Shutdown Script (`stop.bat`)
- **Complete Cleanup**: Stops both API and frontend servers
- **Port Release**: Frees up ports 3001, 8080, and 5173
- **Safe to Restart**: Ensures clean state for next startup

## How to Use

### Starting the Application
Run `start.bat` from the project root. It will:
1. Check dependencies
2. Clean up any existing servers
3. Start the API server
4. Verify API health
5. Start the frontend

### Stopping the Application  
Run `stop.bat` to cleanly shut down both servers.

### Manual Start (Alternative)
```bash
# Terminal 1 - API Server
npm run server

# Terminal 2 - Frontend
npm run dev
```

## Troubleshooting

### If the API server still won't start:
1. Run `stop.bat` to ensure all servers are stopped
2. Check if another application is using port 3001:
   ```bash
   netstat -ano | findstr :3001
   ```
3. Restart your computer to clear any stuck processes
4. Try changing the API port in `.env`:
   ```
   API_PORT=3002
   ```

### If you see "Connection Restored" notifications constantly:
- The API server may be restarting frequently
- Check the API server window for errors
- Review `server.log` for crash details

### If retries are happening too often:
- Adjust retry configuration in `src/lib/api-client.ts`:
  ```typescript
  const RETRY_CONFIG = {
    maxRetries: 2,      // Reduce retries
    retryDelay: 2000,   // Increase delay
    retryableStatuses: [500, 502, 503, 504],
  };
  ```

## Benefits

1. **Better Reliability**: Server automatically recovers from most errors
2. **User Experience**: Clear notifications and automatic reconnection
3. **Easier Debugging**: Better error messages and logging
4. **Clean Operations**: Proper startup and shutdown procedures
5. **Port Management**: Automatic detection and cleanup of port conflicts
