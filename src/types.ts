export enum AccountStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  VIOLATION_WARNING = 'violation_warning',
  SUSPENDED = 'suspended',
}

export enum AccountStage {
  TESTING = 'testing',
  SCALING = 'scaling',
  SCALED = 'scaled',
}

export enum WinningStatus {
  TESTING = 'testing',
  POTENTIAL = 'potential',
  WINNER = 'winner',
  SCALED = 'scaled',
}

export enum ScheduleStatus {
  PLANNED = 'planned',
  EDITING = 'editing',
  PRODUCED = 'produced',
  POSTED = 'posted',
  CANCELLED = 'cancelled',
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  handle: string;
  platform: 'TikTok' | 'Instagram' | 'Shopee Video' | 'Facebook' | 'Kwai';
  status: AccountStatus;
  stage: AccountStage;
  productionFrequency: number;
  healthPoints: number;
  linkedProductIds?: string[];
  imageUrl?: string;
  notes?: string;
  scope?: 'PERSONAL' | 'COMPANY';
  autoRegisterSaved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  userId: string;
  name: string;
  productUrl?: string;
  shopeeUrl?: string;
  referenceUrl?: string;
  category?: string;
  winningStatus: WinningStatus;
  price?: number;
  commissionValue?: number;
  imageUrl?: string;
  notes?: string;
  scope?: 'PERSONAL' | 'COMPANY';
}

export interface Sale {
  id: string;
  userId: string;
  date: string;
  productId: string;
  accountId: string;
  scheduleItemId?: string; // Link to the specific video/post
  creatorHandle?: string;
  quantity: number;
  gmv: number;
  commission: number;
  scope?: 'PERSONAL' | 'COMPANY';
  createdAt: string;
}

export interface ScheduleItem {
  id: string;
  userId: string;
  date: string;
  accountId: string;
  productId: string;
  videoSource?: string;
  minedVideoUrl?: string;
  videoLink?: string;
  audioMaterial?: { url: string; name: string }[];
  videoMaterial?: { url: string; name: string }[];
  finishedVideoUrl?: { url: string; name: string }[];
  producerId?: string; // Assigned editor
  supplierId?: string; // Assigned supplier
  status: ScheduleStatus;
  notes?: string;
  productionNotes?: string;
  creatorHandle?: string;
  creatorLinkId?: string;
  sourceVideoLink?: string;
  productionCode?: string;
  videoCode?: string;
  producedAt?: string;
  postedAt?: any;
  postedBy?: string;
  awaitingPostLink?: boolean;
  postLink?: string | null;
  materialAddedAt?: string;
  dailyIndex?: number;
  scope?: 'PERSONAL' | 'COMPANY';
}

export interface Producer {
  id: string;
  name: string;
  userId: string;
  scope: 'PERSONAL' | 'COMPANY';
  role?: 'editor' | 'supplier';
  linkedUserId?: string;
  linkedUserEmail?: string;
  linkedEmail?: string;
  collaboratorUserId?: string;
  editorUserId?: string;
  supplierUserId?: string;
  linkedAt?: string;
  hidden?: boolean;
  linkedProductIds?: string[];
  createdAt: string;
}

export interface Violation {
  id: string;
  userId: string;
  accountId: string;
  date: string;
  pointsDeducted: number;
  description: string;
  resolved: boolean;
  scope?: 'PERSONAL' | 'COMPANY';
}

export interface UserProfile {
  id: string; // uid_VIEWMODE
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'PARTNER' | 'EMPLOYEE';
  producerRole?: 'editor' | 'supplier';
  collaboratorRole?: 'editor' | 'supplier';
  producerId?: string;
  collaboratorId?: string;
  editorId?: string | null;
  supplierId?: string | null;
  permissions?: {
    production?: boolean;
    contentVault?: boolean;
    editor?: boolean;
    supplier?: boolean;
  };
  viewMode: 'PERSONAL' | 'COMPANY';
  createdAt: any;
}

export interface TiktokLink {
  id: string;
  link: string;
  scope?: 'PERSONAL' | 'COMPANY';
  userId?: string;
  supplierId?: string;
  scheduleItemId?: string;
  creatorHandle?: string;
  createdAt?: any;
}
