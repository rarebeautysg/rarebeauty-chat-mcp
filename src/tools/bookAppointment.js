import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getServicesData } from "../services/servicesData";

const BookAppointmentSchema = z.object({
  serviceIds: z.array(z.string()),
  date: z.string(),
  time: z.string(),
  name: z.string().describe("Name of the person booking"),
  mobile: z.string().describe("Mobile number of the person booking"),
  resourceName: z.string().describe("resourceName of the person booking")
});

export class BookAppointmentTool extends StructuredTool {
  constructor() {
    super();
    this.name = "bookAppointment";
    this.description = "Book appointment for one or more services at a given time. Checks availability too.";
    this.schema = BookAppointmentSchema;
  }

  async _call(inputs) {
    const { serviceIds, date, time, name, mobile, resourceName } = inputs;

    if (!name || !mobile || !resourceName) {
      return JSON.stringify({
        success: false,
        error: "Missing value for input variable resourceName, name, mobile",
        troubleshootingUrl: 'https://js.langchain.com/docs/troubleshooting/errors/INVALID_PROMPT_INPUT/'
      });
    }

    const serviceIdArray = Array.isArray(serviceIds) ? serviceIds : [serviceIds];

    let requestedDate;
    if (date.toLowerCase() === 'today') {
      requestedDate = new Date();
    } else if (date.toLowerCase() === 'tomorrow') {
      requestedDate = new Date();
      requestedDate.setDate(requestedDate.getDate() + 1);
    } else if (date.toLowerCase().includes('next')) {
      requestedDate = new Date();
      if (date.toLowerCase().includes('week')) {
        requestedDate.setDate(requestedDate.getDate() + 7);
      } else if (date.toLowerCase().includes('month')) {
        requestedDate.setMonth(requestedDate.getMonth() + 1);
      } else {
        requestedDate.setDate(requestedDate.getDate() + 1);
      }
    } else {
      requestedDate = new Date(date);
      if (isNaN(requestedDate.getTime())) {
        return JSON.stringify({
          success: false,
          error: `Invalid date format: ${date}`
        });
      }
    }

    const formattedDate = requestedDate.toISOString().split('T')[0];

    const processedServiceIds = [];
    let totalDuration = 0;
    let totalPrice = 0;
    const serviceNames = [];

    const servicesData = getServicesData();
    const allServices = await servicesData.getAllServices();

    for (const serviceId of serviceIdArray) {
      let matchedServiceId = serviceId;
      let serviceName = serviceId;

      if (!serviceId.startsWith('service:')) {
        const matchedService = allServices.find(s =>
          s.name.toLowerCase() === serviceId.toLowerCase() ||
          s.name.toLowerCase().includes(serviceId.toLowerCase())
        );

        if (matchedService) {
          matchedServiceId = matchedService.id;
          serviceName = matchedService.name;
        }
      } else {
        const matchedService = allServices.find(s => s.id === serviceId);
        if (matchedService) {
          serviceName = matchedService.name;
        }
      }

      processedServiceIds.push(matchedServiceId);
      serviceNames.push(serviceName);

      try {
        const duration = await servicesData.getServiceDuration(matchedServiceId);
        totalDuration += duration;

        const matchedService = allServices.find(s => s.id === matchedServiceId);
        if (matchedService && matchedService.price) {
          const price = typeof matchedService.price === 'string'
            ? parseFloat(matchedService.price.replace(/[^0-9.]/g, ''))
            : parseFloat(matchedService.price);
          totalPrice += price;
        }
      } catch (e) {
        totalDuration += 60;
      }
    }

    const parsedTime = time.toLowerCase().replace(/\s/g, '');
    let hours = 0, minutes = 0;

    if (parsedTime.includes(':')) {
      const timeParts = parsedTime.split(':');
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1].replace(/[^0-9]/g, ''), 10);
      if (parsedTime.includes('pm') && hours < 12) hours += 12;
    } else {
      hours = parseInt(parsedTime.replace(/[^0-9]/g, ''), 10);
      if (parsedTime.includes('pm') && hours < 12) hours += 12;
    }

    const bookingDateTime = new Date(requestedDate);
    bookingDateTime.setHours(hours, minutes, 0, 0);

    const formattedStart = `${bookingDateTime.getFullYear()}${(bookingDateTime.getMonth()+1).toString().padStart(2, '0')}${bookingDateTime.getDate().toString().padStart(2, '0')}T${bookingDateTime.getHours().toString().padStart(2, '0')}${bookingDateTime.getMinutes().toString().padStart(2, '0')}`;

    const bookingRequest = {
      name,
      mobile,
      resourceName,
      start: formattedStart,
      serviceIds: processedServiceIds,
      duration: totalDuration,
      totalAmount: totalPrice,
      additional: 0,
      discount: 0,
      toBeInformed: true,
      deposit: 0,
      force: false
    };

    const response = await fetch('/api/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingRequest)
    });
    
    const result = await response.json();

    if (result.success) {
      return JSON.stringify({
        success: true,
        message: `✅ Appointment successfully booked for ${serviceNames.join(', ')} ($${totalPrice.toFixed(2)}) on ${formattedDate} at ${time} for ${name}. It will last about ${totalDuration} minutes.`,
        bookingId: result.id || 'unknown'
      });
    } else {
      return JSON.stringify({
        success: false,
        error: result.error || "Unknown error during booking"
      });
    }
  }
} 