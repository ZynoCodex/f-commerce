import { TenantEntity } from './base.entity.js';

export interface Customer extends TenantEntity {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  archivedAt?: Date;
  version: number;
}