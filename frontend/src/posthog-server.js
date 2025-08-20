import { PostHog } from 'posthog-node';

let posthogInstance = null;

export function getPostHogServer() {
  if (!posthogInstance) {
    posthogInstance = new PostHog(
      'phc_x04GDyzrjWVFNtgaBa4i3HCaBQRB4oPdfvVQKez7F2c',
      {
        host: 'https://us.i.posthog.com',
        flushAt: 1,
        flushInterval: 0
      }
    );
  }
  return posthogInstance;
}