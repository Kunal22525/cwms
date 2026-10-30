'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ConfirmRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window !== 'undefined') {
      router.replace('/auth/confirm' + window.location.search + window.location.hash);
    }
  }, [router]);
  return null;
}
