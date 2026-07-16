export type JivoCustomDataField = {
  title?: string;
  key?: string;
  content: string;
  link?: string;
};

export type JivoContext = {
  source?: string;
  action?: string;
  name?: string;
  email?: string;
  phone?: string;
  description?: string;
  userToken?: string;
  pageTitle?: string;
  pageUrl?: string;
  serviceSlug?: string;
  serviceTitle?: string;
  orderId?: number;
  amount?: number;
  customData?: JivoCustomDataField[];
};

export type JivoEventName =
  | "open"
  | "first_message"
  | "client_start_chat"
  | "contact_sent"
  | "agent_message_received"
  | "webhook";
