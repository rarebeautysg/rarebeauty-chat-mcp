export interface BookingRequest {
  name: string;
  mobile: string;
  resourceName?: string;
  start: string;
  serviceIds: string[];
  duration: number;
  totalAmount: number;
  additional?: number;
  discount?: number;
  toBeInformed?: boolean;
  deposit?: number;
  force?: boolean;
}

export interface BookingResponse {
  data: {
    createAppointment: {
      id: string;
      createdNewContact: boolean;
    }
  };
}

export interface BookingResult {
  id: string;
  createdNewContact: boolean;
  success: boolean;
  message?: string;
} 