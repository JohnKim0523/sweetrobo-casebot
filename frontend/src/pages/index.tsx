import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check for machine parameter
    const urlParams = new URLSearchParams(window.location.search);
    const machine = urlParams.get('machine') || urlParams.get('machineId');

    if (machine) {
      // If machine ID provided (from QR code), go to model selection
      router.replace(`/select-model?machineId=${machine}`);
    } else {
      // For public demo/testing, redirect to model selection
      router.replace('/select-model');
    }
  }, [router]);

  return null;
}