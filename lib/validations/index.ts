import { z } from 'zod';

export const siteSchema = z.object({
  site_code: z.string().min(1, 'Site code is required'),
  site_name: z.string().min(1, 'Site name is required'),
  address: z.string().min(1, 'Address is required'),
  gst_number: z.string().optional(),
  client_name: z.string().optional(),
  contact_number_2: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[0-9+\-\s()]{7,15}$/.test(v),
      'Enter a valid phone number'
    ),
  working_from: z.string().optional(),
  working_to: z.string().optional(),
  supervisor_id: z.string().uuid().optional().or(z.literal('')),
  status: z.enum(['Active', 'Inactive']).default('Active'),
});

export type SiteFormValues = z.infer<typeof siteSchema>;

export const workerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  mobile: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[0-9+\-\s()]{7,15}$/.test(v),
      'Enter a valid mobile number'
    ),
  address: z.string().optional(),
  aadhaar: z.string().optional(),
  trade: z.string().min(1, 'Trade is required'),
  daily_wage: z.coerce
    .number()
    .min(0, 'Daily wage must be 0 or greater')
    .optional()
    .nullable(),
  pf_percentage: z.coerce
    .number()
    .min(0, 'PF must be 0 or greater')
    .max(100, 'PF cannot exceed 100%')
    .optional()
    .nullable(),
  bank_name: z.string().optional(),
  account_number: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[0-9]{9,18}$/.test(v.replace(/\s/g, '')),
      'Enter a valid account number (9-18 digits)'
    ),
  ifsc: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v),
      'Enter a valid IFSC code (e.g. SBIN0001234)'
    ),
  branch: z.string().optional(),
  joining_date: z.string().optional().nullable(),
  site_id: z.string().uuid('Site is required').or(z.literal('')),
  working_place: z.string().optional(),
  work_type: z.string().optional(),
  working_since: z.string().optional().nullable(),
  is_temporary: z.boolean().optional().default(false),
  status: z.enum(['Active', 'Inactive']).default('Active'),
}).superRefine((data, ctx) => {
  if (
    data.bank_name &&
    (!data.account_number || !/^[0-9]{9,18}$/.test(data.account_number.replace(/\s/g, '')))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['account_number'],
      message: 'Account number is required (9-18 digits) when a bank is provided',
    });
  }
  if (data.bank_name && (!data.ifsc || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(data.ifsc))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ifsc'],
      message: 'IFSC code is required when a bank is provided',
    });
  }
});

export type WorkerFormValues = z.infer<typeof workerSchema>;

export const salaryAdvanceSchema = z.object({
  worker_id: z.string().uuid('Worker is required'),
  amount: z.coerce
    .number()
    .positive('Amount must be greater than 0')
    .max(9999999999.99, 'Amount is too large'),
  request_date: z.string().min(1, 'Date is required'),
  reason: z.string().min(1, 'Reason is required'),
  remarks: z.string().optional(),
});

export type SalaryAdvanceFormValues = z.infer<typeof salaryAdvanceSchema>;

export const salaryPaymentSchema = z.object({
  worker_id: z.string().uuid('Worker is required'),
  amount: z.coerce
    .number()
    .positive('Amount must be greater than 0')
    .max(9999999999.99, 'Amount is too large'),
  payment_date: z.string().min(1, 'Date is required'),
  payment_location: z.enum(['On Site', 'In Office'], {
    required_error: 'Select where the salary was paid',
  }),
  remarks: z.string().optional(),
});

export type SalaryPaymentFormValues = z.infer<typeof salaryPaymentSchema>;

export const profileSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  mobile: z.string().optional(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().min(1, 'Full name is required'),
  mobile: z.string().optional(),
  role: z.enum(['admin', 'supervisor', 'site_incharge']),
});

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>;
