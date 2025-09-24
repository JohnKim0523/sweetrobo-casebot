import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check for machine parameter
    const urlParams = new URLSearchParams(window.location.search);
    const machine = urlParams.get('machine') || urlParams.get('machineId');

    if (machine) {
      // If machine ID provided (from QR code), go to editor
      router.replace(`/editor?machine=${machine}`);
    } else {
      // Otherwise, go to editor directly
      router.replace('/editor');
    }
  }, [router]);

  return null;
}