// Mock services data for a beauty salon

// Helper function to format currency
const formatPrice = (price) => {
  return `$${price.toFixed(2)}`;
};

// Sample services data
const servicesData = [
  // Eyelash Extensions
  {
    id: "lash-classic",
    name: "Classic Lash Extensions",
    price: 88,
    duration: 60,
    category: "Eyelash Extensions",
    description: "Natural-looking lash extensions applied one by one to each natural lash."
  },
  {
    id: "lash-hybrid",
    name: "Hybrid Lash Extensions",
    price: 108,
    duration: 75,
    category: "Eyelash Extensions",
    description: "A mix of classic and volume lashes for a fuller, textured look."
  },
  {
    id: "lash-volume",
    name: "Volume Lash Extensions",
    price: 128,
    duration: 90,
    category: "Eyelash Extensions",
    description: "Multiple extensions applied to each natural lash for a dramatic, full look."
  },
  {
    id: "lash-touch-up",
    name: "Lash Touch-Up (2 weeks)",
    price: 48,
    duration: 45,
    category: "Eyelash Extensions",
    description: "Maintenance fill for lash extensions within 2 weeks of application."
  },
  
  // Facials
  {
    id: "facial-basic",
    name: "Basic Facial",
    price: 78,
    duration: 60,
    category: "Facials",
    description: "Cleansing, exfoliation, and hydration facial for all skin types."
  },
  {
    id: "facial-deluxe",
    name: "Deluxe Facial Treatment",
    price: 128,
    duration: 90,
    category: "Facials",
    description: "Advanced facial with mask, massage, and special serums."
  },
  {
    id: "facial-acne",
    name: "Acne Treatment Facial",
    price: 98,
    duration: 75,
    category: "Facials",
    description: "Specialized facial for acne-prone skin to clear and prevent breakouts."
  },
  
  // Waxing
  {
    id: "wax-brow",
    name: "Eyebrow Waxing",
    price: 18,
    duration: 15,
    category: "Waxing",
    description: "Precision eyebrow shaping with wax."
  },
  {
    id: "wax-lip",
    name: "Upper Lip Waxing",
    price: 12,
    duration: 10,
    category: "Waxing",
    description: "Quick upper lip hair removal."
  },
  {
    id: "wax-full-face",
    name: "Full Face Waxing",
    price: 48,
    duration: 30,
    category: "Waxing",
    description: "Complete facial hair removal including brows, upper lip, and chin."
  },
  {
    id: "wax-underarm",
    name: "Underarm Waxing",
    price: 25,
    duration: 20,
    category: "Waxing",
    description: "Underarm hair removal with gentle wax."
  }
];

// Function to get all services with formatted prices
const getAllFormattedServices = async () => {
  // In a real app, this would fetch from a database or API
  // Simulating async behavior
  return new Promise((resolve) => {
    setTimeout(() => {
      const formattedServices = servicesData.map(service => ({
        ...service,
        price: formatPrice(service.price)
      }));
      resolve(formattedServices);
    }, 100);
  });
};

// Function to get a specific service by ID
const getServiceById = async (serviceId) => {
  // In a real app, this would fetch from a database or API
  // Simulating async behavior
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const service = servicesData.find(s => s.id === serviceId);
      if (service) {
        resolve({
          ...service,
          price: formatPrice(service.price)
        });
      } else {
        reject(new Error(`Service with ID ${serviceId} not found`));
      }
    }, 100);
  });
};

// Add the getServiceDuration function
function getServiceDuration(serviceId) {
  const service = servicesData.find(service => service.id === serviceId);
  if (!service) {
    return 60; // Default duration in minutes if service not found
  }
  return service.duration || 60; // Return the duration or default to 60 minutes
}

module.exports = {
  getAllFormattedServices,
  getServiceById,
  getServiceDuration
}; 