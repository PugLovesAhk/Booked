export type QuoteStatus = 'waiting' | 'booked' | 'declined';

export interface Quote {
  id: string;
  user_id: string;
  token: string;
  customer_name: string;
  customer_phone: string;
  job: string;
  price_cents: number;
  status: QuoteStatus;
  sent_at: string | null;
  followups_sent: number;
  last_followup_at: string | null;
  replied_at: string | null;
  responded_at: string | null;
  booked_at: string | null;
  opted_out: boolean;
  unread: boolean;
  last_event: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  business_name: string;
  phone: string;
  followup_template: string;
  followup_days: number[];
  trial_ends_at: string;
  stripe_customer_id: string | null;
  subscription_status: string | null;
}

export interface Message {
  id: number;
  quote_id: string;
  direction: 'out' | 'in';
  kind: 'quote' | 'followup' | 'reply';
  body: string;
  status: string;
  created_at: string;
}
