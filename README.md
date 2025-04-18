# Rare Beauty Chat

A conversational AI chat interface for Rare Beauty Professional salon in Singapore. This application enables customers to inquire about services, check availability, and book appointments through a natural language chat interface.

## Features

- 🤖 AI-powered chat assistant using OpenAI GPT models
- 📅 Appointment booking with calendar integration
- 👤 Customer information lookup and management
- 📋 Service listings and pricing information
- 📱 Responsive, mobile-friendly interface
- 🔄 Session persistence for continuous conversations

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **AI/ML**: OpenAI API, LangChain
- **State Management**: React hooks
- **Styling**: Tailwind CSS with custom components

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rarebeautysg/rarebeauty-chat.git
   cd rarebeauty-chat
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create `.env.local` file in the root directory with your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Development

### Project Structure

```
rarebeauty-chat/
├── src/
│   ├── app/                 # Next.js app router
│   │   ├── api/             # API routes
│   │   │   └── chat/        # Chat API endpoint
│   │   ├── page.tsx         # Main chat page
│   │   └── layout.tsx       # Root layout
│   ├── components/          # React components
│   │   ├── ChatInterface.tsx    # Main chat UI component
│   │   ├── ChatInput.tsx        # Input component
│   │   ├── MessageBubble.tsx    # Message display component
│   │   └── Loading.tsx          # Loading indicator
│   ├── prompts/             # AI system prompts
│   │   └── systemPrompt.js  # Main system prompt
│   ├── tools/               # LangChain tools
│   │   ├── lookupUser.js        # Customer lookup tool
│   │   ├── getServices.js       # Service listing tool
│   │   ├── getAvailableSlots.js # Slot availability tool
│   │   └── bookAppointment.js   # Appointment booking tool
│   ├── services/            # Service logic
│   │   └── servicesData.js      # Service data handling
│   └── types/               # TypeScript type definitions
│       └── tools.ts         # Tool result type definitions
├── public/                  # Static assets
└── .env.local               # Environment variables
```

### Key Components

1. **ChatInterface**: Main component that combines the message display area and input field.
2. **MessageBubble**: Displays individual chat messages with styling based on the sender.
3. **ChatInput**: User input component with submit functionality.
4. **API Route Handler**: Manages the chat flow, connection to OpenAI, and execution of tools.

### Tools

The application uses LangChain tools to handle specific functionality:

- **lookupUser**: Find customer information by phone number
- **getServices**: Retrieve service listings and pricing
- **getAvailableSlots**: Check appointment availability
- **bookAppointment**: Create new appointments

## Deployment

The application can be deployed to Vercel or any other Next.js compatible hosting service.

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Frarebeauty-chat)

## License

This project is licensed under the MIT License.

## Acknowledgements

- [OpenAI](https://openai.com/) for the AI models
- [LangChain](https://langchain.com/) for the agent framework
- [Next.js](https://nextjs.org/) for the React framework
- [Tailwind CSS](https://tailwindcss.com/) for styling
