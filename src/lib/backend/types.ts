import type { Message, Profile, Quote, QuoteStatus } from '../types';

export interface SessionInfo {
  userId: string;
  email: string;
  demo: boolean;
}

export interface SmsResult {
  ok: boolean;
  status: string;
  error?: string;
}

export interface NewQuoteInput {
  customer_name: string;
  customer_phone: string;
  job: string;
  price: number;
}

export type ProfilePatch = Partial<Pick<Profile, 'business_name' | 'phone' | 'followup_template' | 'followup_days'>>;

export interface LiveHandlers {
  onQuote: (q: Quote) => void;
  onDelete: (id: string) => void;
  onProfile: (p: Profile) => void;
}

/** Everything the signed-in app needs. Implemented by Supabase (live) and the local demo account. */
export interface Backend {
  loadProfile(userId: string): Promise<Profile | null>;
  loadQuotes(): Promise<Quote[]>;
  loadMessages(quoteId: string): Promise<Message[]>;
  subscribe(userId: string, handlers: LiveHandlers): () => void;
  createQuote(input: NewQuoteInput): Promise<{ quote: Quote; sms: SmsResult }>;
  resendQuote(id: string): Promise<{ quote: Quote; sms: SmsResult }>;
  updateQuote(id: string, patch: { status?: QuoteStatus; unread?: boolean }): Promise<Quote>;
  deleteQuote(id: string): Promise<void>;
  saveProfile(userId: string, patch: ProfilePatch): Promise<Profile>;
  billing(action: 'checkout' | 'portal'): Promise<{ url: string }>;
  updatePassword(password: string): Promise<void>;
}

/** What the customer sees on the quote link page. */
export interface PublicView {
  business_name: string;
  business_phone: string;
  customer_name: string;
  job: string;
  price_cents: number;
  status: QuoteStatus;
  created_at: string;
}
