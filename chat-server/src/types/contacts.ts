export interface Contact {
  name: string;
  mobile: string;
  display: string;
  resourceName: string;
}

export interface ContactsResponse {
  data: {
    contacts: Contact[];
  };
} 