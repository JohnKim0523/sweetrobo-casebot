export async function sendToPrint(imageBase64: string, phoneModel: string) {
  const res = await fetch('http://localhost:3000/print/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64, phoneModel }),
  });

  if (!res.ok) throw new Error('Print failed');
  return await res.json();
}
