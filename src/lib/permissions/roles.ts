import { RoleType } from '@/types';

export const ROLES: Record<RoleType, { name: RoleType; label: string; description: string }> = {
  MAIN_ADMIN: {
    name: 'MAIN_ADMIN',
    label: 'Main Admin',
    description: 'Global system administrator with unrestricted control over all organizations, users, and platform settings.',
  },
  ORG_ADMIN: {
    name: 'ORG_ADMIN',
    label: 'Organization Admin',
    description: 'Administrator for an individual organization. Manages organization members, settings, and workspace resources.',
  },
  EMPLOYEE: {
    name: 'EMPLOYEE',
    label: 'Employee',
    description: 'Operational team member within an organization with limited read and execute permissions.',
  },
};

export const ROLE_HIERARCHY: Record<RoleType, number> = {
  MAIN_ADMIN: 100,
  ORG_ADMIN: 50,
  EMPLOYEE: 10,
};
