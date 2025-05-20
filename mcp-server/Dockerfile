FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Attempt to copy .env.production as .env if it exists
RUN if [ -f .env.production ]; then cp .env.production .env; fi

# Expose the port the app runs on
EXPOSE 3003

# Set environment variables
ENV NODE_ENV production

# Note: MCP server loads .env or .env.local based on NODE_ENV
# For production deployment, ensure .env file is present or use environment variables

# Start the application
CMD ["npm", "start"] 