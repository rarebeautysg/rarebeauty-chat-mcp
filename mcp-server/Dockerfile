FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose the port the app runs on
EXPOSE 3003

# Set environment variables
ENV NODE_ENV production

# Command to run the application
CMD ["node", "server.js"] 