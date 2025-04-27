// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins, tighten this in production
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  },
  transports: ['websocket', 'polling'], // Explicitly enable both transports
  allowEIO3: true, // Enable compatibility with Socket.IO v2 clients
  pingTimeout: 60000, // Increase ping timeout
  pingInterval: 25000 // Adjust ping interval
}); 