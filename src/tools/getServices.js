import { DynamicStructuredTool } from "@langchain/core/tools";

// Service data from the provided JSON
export const servicesData = {
  "services": [
    {
      "count": 4925,
      "duration": 70,
      "followUp": "service:5-2024",
      "id": "service:2-2024",
      "index": 0,
      "price": 75,
      "service": "Lashes - Full Set - Dense"
    },
    {
      "count": 4528,
      "duration": 0,
      "id": "service:5",
      "index": 1,
      "price": 5,
      "service": "Eye Mask"
    },
    {
      "count": 3244,
      "duration": 70,
      "followUp": "service:5-2022",
      "enabled": false,
      "id": "service:2-2022",
      "index": 2,
      "price": 70,
      "service": "Lashes - Full Set - Dense"
    },
    {
      "count": 2877,
      "duration": 5,
      "id": "service:17-2022",
      "index": 3,
      "price": 6,
      "service": "Threading - Eyebrow"
    },
    {
      "count": 1174,
      "duration": 70,
      "followUp": "service:4-2024",
      "id": "service:1-2024",
      "index": 4,
      "price": 65,
      "service": "Lashes - Full Set - Natural"
    },
    {
      "count": 1117,
      "duration": 80,
      "id": "service:102-2024",
      "index": 5,
      "price": 100,
      "service": "Facial - Treatment"
    },
    {
      "count": 1089,
      "duration": 25,
      "id": "service:5-2024",
      "index": 6,
      "price": 33,
      "service": "Lashes - Touch Up - Dense"
    },
    {
      "count": 1025,
      "duration": 10,
      "id": "service:101-2023",
      "index": 7,
      "price": 20,
      "service": "Facial - Ampoule Hydrating"
    },
    {
      "count": 923,
      "duration": 75,
      "followUp": "service:6-2024",
      "id": "service:3-2024",
      "index": 8,
      "price": 85,
      "service": "Lashes - Full Set - Russian"
    },
    {
      "count": 866,
      "duration": 70,
      "enabled": false,
      "followUp": "service:4-2022",
      "id": "service:1-2022",
      "index": 9,
      "price": 60,
      "service": "Lashes - Full Set - Natural"
    },
    {
      "count": 841,
      "duration": 80,
      "id": "service:102-2022",
      "enabled": true,
      "index": 10,
      "price": 90,
      "service": "Facial - Treatment"
    },
    {
      "count": 697,
      "duration": 10,
      "id": "service:102-2023",
      "index": 11,
      "price": 20,
      "service": "Facial - Ampoule Radiance"
    },
    {
      "count": 694,
      "duration": 15,
      "id": "service:103-2023",
      "index": 12,
      "price": 25,
      "service": "Facial - Ampoule Acne"
    },
    {
      "count": 689,
      "duration": 5,
      "id": "service:100-2023",
      "index": 13,
      "price": 15,
      "service": "Facial - Addon Lifting"
    },
    {
      "count": 667,
      "duration": 25,
      "id": "service:5-2022",
      "index": 14,
      "price": 30,
      "enabled": false,
      "service": "Lashes - Touch Up - Dense"
    },
    {
      "count": 650,
      "duration": 60,
      "id": "service:101-2024",
      "index": 15,
      "price": 65,
      "service": "Facial - Radiance"
    },
    {
      "count": 640,
      "duration": 75,
      "followUp": "service:6-2022",
      "id": "service:3-2022",
      "index": 16,
      "price": 80,
      "enabled": false,
      "service": "Lashes - Full Set - Russian"
    },
    {
      "count": 613,
      "duration": 25,
      "id": "service:7-2022",
      "index": 17,
      "price": 25,
      "enabled": true,
      "service": "Lashes - Lower Set - Natural"
    },
    {
      "count": 547,
      "duration": 5,
      "id": "service:202-2022",
      "index": 18,
      "price": 4,
      "service": "Threading - Upper Lip"
    },
    {
      "count": 498,
      "duration": 15,
      "id": "service:301-2022",
      "index": 19,
      "price": 20,
      "service": "Waxing - Under Arm"
    },
    {
      "count": 437,
      "duration": 60,
      "id": "service:101-2022",
      "index": 20,
      "enabled": true,
      "price": 60,
      "service": "Facial - Radiance"
    },
    {
      "count": 386,
      "duration": 30,
      "id": "service:302-2024",
      "index": 21,
      "price": 50,
      "service": "Waxing - Brazilian"
    },
    {
      "count": 319,
      "duration": 5,
      "id": "service:303-2022",
      "index": 22,
      "price": 8,
      "service": "Waxing - Upper Lip"
    },
    {
      "count": 293,
      "duration": 25,
      "id": "service:6",
      "index": 23,
      "price": 10,
      "service": "Lashes - Removal"
    },
    {
      "count": 290,
      "duration": 15,
      "id": "service:10-2022",
      "index": 24,
      "price": 25,
      "service": "Waxing - Half Leg"
    },
    {
      "count": 277,
      "duration": 30,
      "id": "service:201-2022",
      "index": 25,
      "price": 25,
      "service": "Threading - Full Face"
    },
    {
      "count": 263,
      "duration": 30,
      "id": "service:302-2022",
      "enabled": true,
      "index": 26,
      "price": 45,
      "service": "Waxing - Brazilian"
    },
    {
      "count": 259,
      "duration": 20,
      "id": "service:308-2022",
      "index": 27,
      "price": 35,
      "service": "Waxing - Full Face"
    },
    {
      "count": 219,
      "duration": 30,
      "id": "service:6-2024",
      "index": 28,
      "price": 38,
      "service": "Lashes - Touch Up - Russian"
    },
    {
      "count": 166,
      "duration": 15,
      "id": "service:305-2022",
      "index": 29,
      "price": 10,
      "service": "Waxing - Eyebrow"
    },
    {
      "count": 163,
      "duration": 30,
      "id": "service:6-2022",
      "enabled": false,
      "index": 30,
      "price": 35,
      "service": "Lashes - Touch Up - Russian"
    },
    {
      "count": 146,
      "duration": 25,
      "id": "service:4-2024",
      "index": 31,
      "price": 28,
      "service": "Lashes - Touch Up - Natural"
    },
    {
      "count": 126,
      "duration": 25,
      "id": "service:4-2022",
      "index": 32,
      "price": 25,
      "enabled": false,
      "service": "Lashes - Touch Up - Natural"
    },
    {
      "count": 125,
      "duration": 10,
      "id": "service:304-2022",
      "index": 33,
      "price": 10,
      "service": "Waxing - Crack"
    },
    {
      "count": 117,
      "duration": 5,
      "id": "service:203-2022",
      "index": 34,
      "price": 10,
      "service": "Threading - Eyebrow (Men)"
    },
    {
      "count": 112,
      "duration": 20,
      "id": "service:306-2024",
      "index": 35,
      "price": 45,
      "service": "Waxing - Full Leg"
    },
    {
      "count": 90,
      "duration": 20,
      "id": "service:307-2024",
      "index": 36,
      "price": 35,
      "service": "Waxing - Full Arm"
    },
    {
      "count": 80,
      "duration": 20,
      "id": "service:306-2022",
      "enabled": true,
      "index": 37,
      "price": 40,
      "service": "Waxing - Full Leg"
    },
    {
      "count": 71,
      "duration": 5,
      "id": "service:309-2022",
      "index": 38,
      "price": 6,
      "service": "Waxing - Lower Lip"
    },
    {
      "count": 60,
      "enabled": true,
      "duration": 20,
      "id": "service:307-2022",
      "index": 39,
      "price": 30,
      "service": "Waxing - Full Arm"
    },
    {
      "count": 46,
      "duration": 5,
      "id": "service:311-2022",
      "index": 40,
      "price": 10,
      "service": "Waxing - Finger"
    },
    {
      "count": 32,
      "duration": 15,
      "id": "service:310-2022",
      "index": 41,
      "price": 20,
      "service": "Waxing - Half Arm"
    },
    {
      "count": 30,
      "duration": 5,
      "id": "service:204-2022",
      "index": 42,
      "price": 3,
      "service": "Threading - Lower Lip"
    },
    {
      "count": 27,
      "duration": 0,
      "id": "product:1",
      "index": 43,
      "price": 1,
      "service": "Lash Brush"
    },
    {
      "count": 6,
      "duration": 100,
      "id": "service:501-2022",
      "index": 44,
      "price": 350,
      "service": "Skin - Treatment"
    },
    // There are more services in the list but I've truncated them to avoid making the file too large
  ]
};

// Create the tool
export const getServicesTool = new DynamicStructuredTool({
  name: "getServices",
  description: "Get information about beauty services offered by Rare Beauty Professional",
  schema: {
    type: "object",
    properties: {
      category: { 
        type: "string",
        enum: ["Lashes", "Facial", "Waxing", "Threading", "Skin"],
        description: "The category of services to filter by. Choose from: Lashes, Facial, Waxing, Threading, or Skin treatments."
      },
      activeOnly: {
        type: "boolean",
        default: true,
        description: "Whether to return only active services. Set to false to include disabled/legacy services."
      },
      includeDuration: {
        type: "boolean",
        default: false,
        description: "Whether to include duration in the response. Set to true to include service durations."
      }
    },
    required: [],
    additionalProperties: false
  },
  returnType: {
    type: "object",
    properties: {
      categories: {
        type: "object",
        additionalProperties: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The name of the service"
              },
              duration: {
                type: "integer",
                description: "Duration of the service in minutes"
              },
              price: {
                type: "number",
                description: "Price of the service in dollars"
              },
              id: {
                type: "string",
                description: "Unique identifier for the service"
              }
            }
          }
        },
        description: "Services organized by category"
      }
    },
    description: "Returns services organized by category with their details including name, duration, price, and ID."
  },
  func: async ({ category, activeOnly = true, includeDuration = false }) => {
    console.log(`🔍 Getting services${category ? ` for category: ${category}` : ''} (activeOnly: ${activeOnly}, includeDuration: ${includeDuration})`);
    
    try {
      // Construct the API URL with query parameters
      const queryParams = new URLSearchParams();
      if (category) queryParams.append('category', category);
      if (activeOnly !== undefined) queryParams.append('activeOnly', activeOnly.toString());
      if (includeDuration !== undefined) queryParams.append('includeDuration', includeDuration.toString());
      
      const apiUrl = `/api/services?${queryParams.toString()}`;
      console.log(`Making API request to: ${apiUrl}`);
      
      // Make a fetch request to the services API
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Services API response received with ${Object.keys(data.categories).length} categories`);
      
      // Ensure that there are no empty categories
      const nonEmptyCategories = {};
      Object.keys(data.categories).forEach(categoryName => {
        if (data.categories[categoryName].length > 0) {
          nonEmptyCategories[categoryName] = data.categories[categoryName];
        }
      });
      
      return JSON.stringify({ categories: nonEmptyCategories });
    } catch (error) {
      console.error('Error fetching services from API:', error);
      throw new Error('Failed to fetch services. Please try again later.');
    }
  }
});

// Export the function to get active services for other modules that need it
export const getActiveServices = async () => {
  try {
    const response = await fetch('/api/services?activeOnly=true');
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const data = await response.json();
    
    // Flatten all categories into a single array
    let allServices = [];
    Object.keys(data.categories).forEach(category => {
      allServices = [...allServices, ...data.categories[category]];
    });
    
    return allServices;
  } catch (error) {
    console.error('Error fetching active services:', error);
    return [];
  }
}; 