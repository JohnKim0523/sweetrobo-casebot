import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to model selection page
    router.replace('/select-model');
  }, [router]);

  return null;
}