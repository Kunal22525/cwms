'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { COMPANY_NAME } from '@/lib/company';
import type { CompanySettings } from '@/types';

const DEFAULT_SETTINGS: CompanySettings = {
  id: true,
  company_name: COMPANY_NAME,
  tagline: 'Workforce Management System',
  logo_url: null,
  phone: null,
  email: null,
  address: null,
  gst_number: null,
  updated_at: '',
};

export function useCompanySettings() {
  return useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return (data as CompanySettings | null) ?? DEFAULT_SETTINGS;
    },
    staleTime: 60 * 1000,
  });
}