import {
  contactRepository,
  UpdateContactInput,
  ContactListFilters,
} from '@/lib/db/repositories/contact.repository';
import { Contact } from '@/types/crm';
import { normalizePhoneNumber } from '@/lib/utils/phone';
import { logger } from '@/lib/utils/logger';

export interface ResolveContactInput {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export class ContactService {
  /**
   * Normalize input and create or resolve an existing contact.
   * Deterministic matching on normalized phone or email within the same organization.
   */
  async resolveOrCreateContact(
    organizationId: string,
    input: ResolveContactInput
  ): Promise<{ contact: Contact; isNew: boolean }> {
    let normalizedPhone: string | null = null;
    if (input.phone) {
      try {
        normalizedPhone = normalizePhoneNumber(input.phone);
      } catch {
        // If not strictly valid E.164, strip non-digits as fallback but don't crash
        normalizedPhone = input.phone.trim();
      }
    }

    const normalizedEmail = input.email ? input.email.trim().toLowerCase() : null;

    // 1. Check existing by normalized phone
    if (normalizedPhone) {
      const existing = await contactRepository.findByNormalizedPhone(organizationId, normalizedPhone);
      if (existing) {
        logger.info('contact.resolved_by_phone', {
          action: 'CONTACT_RESOLVE',
          metadata: { contactId: existing.id, organizationId },
        });
        return { contact: existing, isNew: false };
      }
    }

    // 2. Check existing by email
    if (normalizedEmail) {
      const existing = await contactRepository.findByEmail(organizationId, normalizedEmail);
      if (existing) {
        logger.info('contact.resolved_by_email', {
          action: 'CONTACT_RESOLVE',
          metadata: { contactId: existing.id, organizationId },
        });
        return { contact: existing, isNew: false };
      }
    }

    // 3. Otherwise create new contact
    const fullName =
      input.fullName?.trim() ||
      [input.firstName, input.lastName].filter(Boolean).join(' ').trim() ||
      (normalizedPhone ? `Contact ${normalizedPhone}` : 'Unknown Contact');

    const created = await contactRepository.create({
      organizationId,
      firstName: input.firstName,
      lastName: input.lastName,
      fullName,
      phone: input.phone,
      normalizedPhone,
      email: normalizedEmail,
      company: input.company,
      city: input.city,
      state: input.state,
      country: input.country,
      timezone: input.timezone,
      tags: input.tags,
      customFields: input.customFields,
    });

    return { contact: created, isNew: true };
  }

  async getContact(id: string, organizationId: string): Promise<Contact | null> {
    return contactRepository.findById(id, organizationId);
  }

  async updateContact(
    id: string,
    organizationId: string,
    input: UpdateContactInput
  ): Promise<Contact | null> {
    let normalizedPhone: string | null | undefined = undefined;
    if (input.phone !== undefined) {
      if (input.phone) {
        try {
          normalizedPhone = normalizePhoneNumber(input.phone);
        } catch {
          normalizedPhone = input.phone.trim();
        }
      } else {
        normalizedPhone = null;
      }
    }

    return contactRepository.update(id, organizationId, {
      ...input,
      ...(normalizedPhone !== undefined ? { normalizedPhone } : {}),
    });
  }

  async listContacts(
    organizationId: string,
    filters: ContactListFilters = {}
  ): Promise<{ contacts: Contact[]; total: number }> {
    const [contacts, total] = await Promise.all([
      contactRepository.list(organizationId, filters),
      contactRepository.count(organizationId, filters),
    ]);

    return { contacts, total };
  }

  async deleteContact(id: string, organizationId: string): Promise<boolean> {
    return contactRepository.delete(id, organizationId);
  }

  async findOrCreateContact(
    organizationId: string,
    input: ResolveContactInput
  ): Promise<Contact> {
    const res = await this.resolveOrCreateContact(organizationId, input);
    return res.contact;
  }
}

export const contactService = new ContactService();
